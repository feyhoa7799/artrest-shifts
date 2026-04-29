import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SendMailResult = {
  sent: boolean;
  reason?: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  startTls: boolean;
  user: string;
  password: string;
  from: string;
  fromAddress: string;
};

type SmtpSocket = net.Socket | tls.TLSSocket;

type PendingWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

class SmtpReader {
  private buffer = '';
  private waiters: PendingWaiter[] = [];
  private socket: SmtpSocket;

  private onData = (chunk: Buffer | string) => {
    this.buffer += chunk.toString();
    this.flushWaiters();
  };

  private onError = (error: Error) => {
    this.rejectWaiters(error);
  };

  private onClose = () => {
    this.rejectWaiters(new Error('SMTP-соединение закрыто'));
  };

  constructor(socket: SmtpSocket) {
    this.socket = socket;
    this.socket.on('data', this.onData);
    this.socket.on('error', this.onError);
    this.socket.on('close', this.onClose);
  }

  destroy() {
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onError);
    this.socket.off('close', this.onClose);
    this.rejectWaiters(new Error('SMTP-reader остановлен'));
  }

  async readResponse(timeoutMs = 15000) {
    const lines: string[] = [];
    let code = 0;

    for (let i = 0; i < 80; i += 1) {
      const line = await this.readLine(timeoutMs);
      lines.push(line);

      const match = line.match(/^(\d{3})([ -])(.*)$/);
      if (!match) continue;

      code = Number(match[1]);

      if (match[2] === ' ') {
        return {
          code,
          message: lines.join('\n'),
        };
      }
    }

    throw new Error(`SMTP прислал слишком длинный ответ: ${lines.join('\n')}`);
  }

  private async readLine(timeoutMs: number) {
    while (!this.buffer.includes('\n')) {
      await this.waitForData(timeoutMs);
    }

    const index = this.buffer.indexOf('\n');
    const line = this.buffer.slice(0, index + 1).replace(/\r?\n$/, '');
    this.buffer = this.buffer.slice(index + 1);

    return line;
  }

  private waitForData(timeoutMs: number) {
    if (this.buffer.includes('\n')) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const waiter: PendingWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiter);
          reject(new Error('SMTP не ответил вовремя'));
        }, timeoutMs),
      };

      this.waiters.push(waiter);
    });
  }

  private flushWaiters() {
    if (!this.buffer.includes('\n')) return;

    const waiters = this.waiters.splice(0);

    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.resolve();
    });
  }

  private rejectWaiters(error: Error) {
    const waiters = this.waiters.splice(0);

    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    });
  }
}

function getBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === '') return fallback;

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function extractEmailAddress(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/<([^>]+)>/);

  return (match?.[1] || trimmed).trim();
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();

  if (!host) return null;

  const secure = getBooleanEnv(process.env.SMTP_SECURE, process.env.SMTP_PORT === '465');
  const port = Number(process.env.SMTP_PORT || (secure ? 465 : 587));

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('SMTP_PORT указан некорректно');
  }

  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    'Арт Рест Подработки <noreply@podrapotka.art-rest.com>';

  return {
    host,
    port,
    secure,
    startTls: getBooleanEnv(process.env.SMTP_STARTTLS, !secure),
    user: process.env.SMTP_USER?.trim() || '',
    password: process.env.SMTP_PASSWORD || '',
    from,
    fromAddress: extractEmailAddress(from),
  };
}

function encodeHeader(value: string) {
  if (/^[\x00-\x7F]*$/.test(value)) return value;

  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function normalizeRecipients(value: string) {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dotStuff(value: string) {
  return value.replace(/^\./gm, '..');
}

function normalizeNewLines(value: string) {
  return value.replace(/\r?\n/g, '\r\n');
}

function buildMimeMessage(config: SmtpConfig, input: SendMailInput) {
  const boundary = `artrest-shifts-${randomUUID()}`;
  const messageId = `<${randomUUID()}@${config.fromAddress.split('@')[1] || 'podrabotka.art-rest.com'}>`;

  const headers = [
    `From: ${encodeHeader(config.from)}`,
    `To: ${normalizeRecipients(input.to).join(', ')}`,
    `Subject: ${encodeHeader(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    '',
    `--${boundary}--`,
    '',
  ];

  return normalizeNewLines([...headers, '', ...body].join('\n'));
}

function createPlainSocket(host: string, port: number) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect({ host, port }, () => resolve(socket));

    socket.once('error', reject);
    socket.setTimeout(30000, () => {
      socket.destroy(new Error('SMTP-соединение превысило таймаут'));
    });
  });
}

function createTlsSocket(host: string, port: number) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host }, () => resolve(socket));

    socket.once('error', reject);
    socket.setTimeout(30000, () => {
      socket.destroy(new Error('SMTP TLS-соединение превысило таймаут'));
    });
  });
}

function upgradeToTls(socket: net.Socket, host: string) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: host }, () => resolve(secureSocket));

    secureSocket.once('error', reject);
    secureSocket.setTimeout(30000, () => {
      secureSocket.destroy(new Error('SMTP STARTTLS-соединение превысило таймаут'));
    });
  });
}

function write(socket: SmtpSocket, value: string) {
  return new Promise<void>((resolve, reject) => {
    socket.write(value, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function command(
  socket: SmtpSocket,
  reader: SmtpReader,
  value: string,
  expectedCodes: number[],
  label: string
) {
  await write(socket, `${value}\r\n`);

  const response = await reader.readResponse();

  if (!expectedCodes.includes(response.code)) {
    throw new Error(`${label}: SMTP ответил ${response.message}`);
  }

  return response;
}

async function sayHello(socket: SmtpSocket, reader: SmtpReader, host: string) {
  const response = await command(socket, reader, `EHLO ${host}`, [250], 'EHLO');

  return response.message;
}

async function authenticate(socket: SmtpSocket, reader: SmtpReader, user: string, password: string) {
  if (!user || !password) return;

  await command(socket, reader, 'AUTH LOGIN', [334], 'AUTH LOGIN');
  await command(
    socket,
    reader,
    Buffer.from(user, 'utf8').toString('base64'),
    [334],
    'SMTP username'
  );
  await command(
    socket,
    reader,
    Buffer.from(password, 'utf8').toString('base64'),
    [235],
    'SMTP password'
  );
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  let socket: SmtpSocket | null = null;
  let reader: SmtpReader | null = null;

  try {
    const config = getSmtpConfig();

    if (!config) {
      return { sent: false, reason: 'SMTP_HOST не указан' };
    }

    const recipients = normalizeRecipients(input.to);

    if (recipients.length === 0) {
      return { sent: false, reason: 'Не указан получатель письма' };
    }

    if (config.secure) {
      socket = await createTlsSocket(config.host, config.port);
    } else {
      socket = await createPlainSocket(config.host, config.port);
    }

    reader = new SmtpReader(socket);

    const greeting = await reader.readResponse();
    if (greeting.code !== 220) {
      throw new Error(`SMTP greeting: ${greeting.message}`);
    }

    await sayHello(socket, reader, config.host);

    if (!config.secure && config.startTls) {
      await command(socket, reader, 'STARTTLS', [220], 'STARTTLS');
      reader.destroy();

      socket = await upgradeToTls(socket as net.Socket, config.host);
      reader = new SmtpReader(socket);

      await sayHello(socket, reader, config.host);
    }

    await authenticate(socket, reader, config.user, config.password);

    await command(socket, reader, `MAIL FROM:<${config.fromAddress}>`, [250], 'MAIL FROM');

    for (const recipient of recipients) {
      await command(socket, reader, `RCPT TO:<${recipient}>`, [250, 251], 'RCPT TO');
    }

    await command(socket, reader, 'DATA', [354], 'DATA');

    const message = dotStuff(buildMimeMessage(config, input));
    await write(socket, `${message}\r\n.\r\n`);

    const dataResponse = await reader.readResponse();
    if (dataResponse.code !== 250) {
      throw new Error(`DATA send: SMTP ответил ${dataResponse.message}`);
    }

    await command(socket, reader, 'QUIT', [221], 'QUIT');

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : 'Ошибка отправки SMTP-письма',
    };
  } finally {
    reader?.destroy();
    socket?.destroy();
  }
}
