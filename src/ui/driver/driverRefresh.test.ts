import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { formatDriverRefreshUpdatedAt } from './driverRefresh';

const driverUiDirectory = dirname(fileURLToPath(import.meta.url));

describe('driver page refresh', () => {
  it('formats the latest successful server refresh in local time', () => {
    assert.equal(
      formatDriverRefreshUpdatedAt(new Date(2026, 7, 24, 9, 5, 7)),
      '마지막 갱신 2026.08.24 09:05:07',
    );
    assert.equal(formatDriverRefreshUpdatedAt(null), '마지막 갱신 —');
  });

  it('offers pull refresh without a persistent refresh status block', () => {
    const refreshControl = readFileSync(
      join(driverUiDirectory, 'DriverRefreshControl.tsx'),
      'utf8',
    );
    const delivery = readFileSync(
      join(driverUiDirectory, 'DeliveryScreen.tsx'),
      'utf8',
    );
    const map = readFileSync(
      join(driverUiDirectory, 'DeliveryMapScreen.tsx'),
      'utf8',
    );
    const space = readFileSync(
      join(driverUiDirectory, 'DeliverySpaceScreen.tsx'),
      'utf8',
    );
    const workspace = readFileSync(
      join(driverUiDirectory, 'DriverWorkspace.tsx'),
      'utf8',
    );

    assert.match(refreshControl, /<RefreshControl/u);
    assert.match(refreshControl, /\.\.\.nativeProps/u);
    assert.match(refreshControl, /formatDriverRefreshUpdatedAt/u);
    assert.doesNotMatch(refreshControl, /DriverRefreshStatus/u);
    assert.doesNotMatch(refreshControl, />새로고침</u);

    assert.match(delivery, /refreshControl=\{[\s\S]*<DriverRefreshControl/u);
    assert.doesNotMatch(delivery, /<DriverRefreshStatus/u);
    assert.match(map, /refreshControl=\{[\s\S]*<DriverRefreshControl/u);
    assert.doesNotMatch(map, /<DriverRefreshStatus/u);
    assert.match(space, /refreshControl=\{[\s\S]*<DriverRefreshControl/u);
    assert.doesNotMatch(space, /<DriverRefreshStatus/u);

    assert.match(workspace, /const \[lastRouteUpdatedAt, setLastRouteUpdatedAt\]/u);
    assert.match(workspace, /setLastRouteUpdatedAt\(new Date\(\)\)/u);
    assert.match(workspace, /onRefresh=\{refreshRoute\}/u);
    assert.match(space, /setLastUpdatedAt\(new Date\(\)\)/u);
  });
});
