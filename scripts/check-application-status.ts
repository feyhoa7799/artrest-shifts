import assert from 'node:assert/strict';

import { getEmployeeApplicationStatus, getShiftDateTimeRangeMoscow } from '../lib/application-status';

const now = new Date('2026-06-17T12:00:00+03:00');

function status(params: Parameters<typeof getEmployeeApplicationStatus>[0]) {
  return getEmployeeApplicationStatus({ now, slotStatus: 'open', ...params });
}

assert.equal(
  getShiftDateTimeRangeMoscow({
    workDate: '2026-06-18',
    timeFrom: '10:00',
    timeTo: '18:00',
  }).isValid,
  true,
  'time_to HH:MM should be valid'
);

assert.equal(
  getShiftDateTimeRangeMoscow({
    workDate: '2026-06-18',
    timeFrom: '10:00:00',
    timeTo: '18:00:00',
  }).isValid,
  true,
  'time_to HH:MM:SS should be valid'
);

assert.equal(
  status({
    applicationStatus: 'approved',
    workDate: '2026-05-15',
    timeFrom: '10:00:00',
    timeTo: '18:00:00',
  }).derivedStatus,
  'finished',
  'old approved shift should be finished'
);

assert.equal(
  status({
    applicationStatus: 'approved',
    workDate: '2026-06-18',
    timeFrom: '10:00',
    timeTo: '18:00',
  }).derivedStatus,
  'active',
  'future approved shift should be active'
);

const closedFutureApproved = status({
  applicationStatus: 'approved',
  slotStatus: 'closed',
  workDate: '2026-06-18',
  timeFrom: '10:00',
  timeTo: '18:00',
});

assert.equal(
  closedFutureApproved.derivedStatus,
  'finished',
  'closed future approved shift should be finished'
);
assert.equal(
  closedFutureApproved.isActiveApproved,
  false,
  'closed future approved shift should not be active'
);

const overnight = getShiftDateTimeRangeMoscow({
  workDate: '2026-06-18',
  timeFrom: '22:00',
  timeTo: '06:00',
});

assert.equal(overnight.isValid, true, 'overnight shift should be valid');
assert.equal(
  overnight.end?.toISOString(),
  '2026-06-19T03:00:00.000Z',
  'overnight shift should end on the next Moscow day'
);

assert.notEqual(
  status({
    applicationStatus: 'approved',
    workDate: '2026-06-18',
    timeFrom: '10:00',
    timeTo: 'bad-time',
  }).derivedStatus,
  'active',
  'invalid time should not be active'
);

assert.equal(
  status({
    applicationStatus: 'rejected',
    workDate: '2026-06-18',
    timeFrom: '10:00',
    timeTo: '18:00',
  }).derivedStatus,
  'rejected',
  'rejected application should stay rejected'
);

assert.equal(
  status({
    applicationStatus: 'pending',
    workDate: '2026-06-18',
    timeFrom: '10:00',
    timeTo: '18:00',
  }).derivedStatus,
  'pending',
  'future pending application should stay pending'
);

console.log('application status self-check passed');
