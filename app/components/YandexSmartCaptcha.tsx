'use client';

import { SmartCaptcha } from '@yandex/smart-captcha';

const DEFAULT_SITE_KEY =
  'ysc1_oU7uW0mr8hoEhl6omcNdAEzINeaJ2a40cBT49Nb6991907a9';

type YandexSmartCaptchaProps = {
  onTokenChange: (token: string | null) => void;
  onError: () => void;
};

export default function YandexSmartCaptcha({
  onTokenChange,
  onError,
}: YandexSmartCaptchaProps) {
  const siteKey =
    process.env.NEXT_PUBLIC_YANDEX_SMARTCAPTCHA_SITE_KEY || DEFAULT_SITE_KEY;

  return (
    <div className="min-h-[100px]">
      <SmartCaptcha
        sitekey={siteKey}
        language="ru"
        onSuccess={(token) => onTokenChange(token)}
        onTokenExpired={() => onTokenChange(null)}
        onNetworkError={() => {
          onTokenChange(null);
          onError();
        }}
        onJavascriptError={() => {
          onTokenChange(null);
          onError();
        }}
      />
    </div>
  );
}
