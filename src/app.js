// -----------------------------------------------------------------------------
// Wiring between the Gladys SDK and the integration's logic (src/service.js).
// It holds no Sibelga logic: it only registers the handlers — BEFORE
// `connect()` — and runs the (re)initialization on every connection.
//
// Kept apart from index.js so the tests can wire a fake Gladys the same way.
// -----------------------------------------------------------------------------

import { logger } from '@gladysassistant/integration-sdk';
import { ACTIONS } from './actions.js';
import { t } from './i18n.js';
import { SCENE_ACTIONS } from './scenes.js';
import { SibelgaService } from './service.js';
import { WIDGETS } from './widgets.js';

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options] test seams of SibelgaService (fetchImpl, store, now)
 * @returns {SibelgaService}
 */
export function registerHandlers(gladys, options = {}) {
  const service = new SibelgaService(gladys, options);
  let initialized = false;

  // --- Discovery: Gladys asks for the list of devices ------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> publishing discovered devices');
    if (service.meters.size === 0) {
      // Nothing read yet (or the last read failed): try now, so the user who
      // just saved their account sees their meters.
      await service.refreshConsumption();
    }
    await service.publishDevices();
  });

  // --- A device was created: Gladys dropped what was published before --------
  gladys.onDeviceCreated(async () => {
    await service.publishData();
  });

  // --- Manifest actions: buttons of the Configuration screen -----------------
  for (const [actionKey, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(actionKey, (fields) => handler(service, { fields }));
  }

  // --- Scene actions ---------------------------------------------------------
  // Scene TRIGGERS need no handler: the service fires them.
  for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(actionKey, (fields) => handler(service, { fields }));
  }

  // --- Dashboard widgets -----------------------------------------------------
  for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(widgetKey, (request) => widget.get(gladys, service, request));
    if (typeof widget.action === 'function') {
      gladys.onWidgetAction(widgetKey, (actionKey, params, { settings }) =>
        widget.action(gladys, service, { actionKey, params, settings }),
      );
    }
  }

  // --- Configuration updated by the user -------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    service.configure(newConfig);
    service.start();
    // The grid device follows the "grid status" toggle.
    await service.publishDevices();
    await service.refreshAll();
  });

  // --- Connection lifecycle --------------------------------------------------
  gladys.on('connected', async () => {
    try {
      if (!initialized) {
        await service.init();
        initialized = true;
      }
      service.configure(await gladys.getConfig());
      await service.locateHomes();
      await service.publishDevices();
      service.start();
      await service.refreshAll();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys.setConnectionStatus(false, t('status.init_failed')).catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    service.stop();
  });

  // --- Graceful shutdown -----------------------------------------------------
  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    service.stop();
  });

  return service;
}
