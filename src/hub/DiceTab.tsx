import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pixel } from "@systemic-games/pixels-core-connect";
import { repeatConnect, getPixel, requestPixel } from "@systemic-games/pixels-web-connect";
import { Button, Card, DieRow, Modal } from '../components/UI';
import { Plus, Bluetooth, Info, CheckCircle2, RefreshCw } from 'lucide-react';

// Persistent record of a die the user has paired. systemId is the stable per-device
// id used to (re)connect; the rest is cached so disconnected dice still render nicely.
interface SavedDie {
  systemId: string;
  pixelId?: string;
  name?: string;
  dieType?: string;
  colorway?: string;
  battery?: number;
}

// Auto-reconnect backoff bounds (ms).
const RECONNECT_MIN_DELAY = 3000;
const RECONNECT_MAX_DELAY = 30000;
// How often we re-scan granted devices to pick up dice that were woken/brought back in range.
const REDISCOVER_INTERVAL = 15000;

function normalizeSaved(raw: unknown): SavedDie[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => (typeof entry === 'string' ? { systemId: entry } : entry))
    .filter((d): d is SavedDie => !!d && typeof d.systemId === 'string');
}

const DiceTab: React.FC = () => {
  const [activeDice, setActiveDice] = useState<Map<string, Pixel>>(new Map());
  const [saved, setSaved] = useState<SavedDie[]>([]);
  const [reconnecting, setReconnecting] = useState<Set<string>>(new Set());
  const [isPairing, setIsPairing] = useState<boolean>(false);
  const [showBluetoothFlag, setShowBluetoothFlag] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [hubDice, setHubDice] = useState<any[]>([]);
  const [connectError, setConnectError] = useState<string | null>(null);

  const activeDiceRef = useRef(activeDice);
  useEffect(() => { activeDiceRef.current = activeDice; }, [activeDice]);

  const savedRef = useRef(saved);
  useEffect(() => { savedRef.current = saved; }, [saved]);

  // Dice the user has explicitly removed this session — never auto-reconnect these.
  const suppressedRef = useRef<Set<string>>(new Set());
  // Listeners are attached once per Pixel instance (getPixel returns the same instance).
  const listenersAttachedRef = useRef<Set<string>>(new Set());
  // Pending backoff timers and the current backoff delay per die.
  const reconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const backoffRef = useRef<Map<string, number>>(new Map());

  const updateUI = useCallback(() => {
    setActiveDice(prev => new Map(prev));
  }, []);

  // Mirror of `reconnecting` for use inside long-lived listeners without stale closures.
  const reconnectingRef = useRef<Set<string>>(new Set());

  const markReconnecting = useCallback((systemId: string, on: boolean) => {
    const next = new Set(reconnectingRef.current);
    if (on) next.add(systemId); else next.delete(systemId);
    reconnectingRef.current = next;
    setReconnecting(next);
  }, []);

  // ---- Saved-dice persistence ---------------------------------------------

  const refreshSaved = useCallback(async (): Promise<SavedDie[]> => {
    const result = await chrome.storage.local.get(['savedDice']);
    const list = normalizeSaved(result.savedDice);
    setSaved(list);
    return list;
  }, []);

  const upsertSaved = useCallback(async (entry: SavedDie) => {
    const result = await chrome.storage.local.get(['savedDice']);
    const list = normalizeSaved(result.savedDice);
    const idx = list.findIndex(d => d.systemId === entry.systemId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...entry };
    } else {
      list.push(entry);
    }
    await chrome.storage.local.set({ savedDice: list });
    setSaved(list);
  }, []);

  const removeSaved = useCallback(async (systemId: string) => {
    const result = await chrome.storage.local.get(['savedDice']);
    const list = normalizeSaved(result.savedDice).filter(d => d.systemId !== systemId);
    await chrome.storage.local.set({ savedDice: list });
    setSaved(list);
  }, []);

  // ---- Reconnect scheduling ------------------------------------------------

  const clearReconnectTimer = useCallback((systemId: string) => {
    const t = reconnectTimersRef.current.get(systemId);
    if (t) {
      clearTimeout(t);
      reconnectTimersRef.current.delete(systemId);
    }
  }, []);

  // connectWithRetry is defined below; this ref breaks the declaration cycle with scheduleReconnect.
  const connectRef = useRef<(systemId: string, manual: boolean) => Promise<boolean>>();

  const scheduleReconnect = useCallback((systemId: string) => {
    if (suppressedRef.current.has(systemId)) return;
    if (reconnectTimersRef.current.has(systemId)) return; // already queued
    const delay = backoffRef.current.get(systemId) ?? RECONNECT_MIN_DELAY;
    backoffRef.current.set(systemId, Math.min(delay * 2, RECONNECT_MAX_DELAY));
    const timer = setTimeout(() => {
      reconnectTimersRef.current.delete(systemId);
      connectRef.current?.(systemId, false);
    }, delay);
    reconnectTimersRef.current.set(systemId, timer);
  }, []);

  // ---- Pixel event wiring --------------------------------------------------

  const setupPixelListeners = useCallback((pixel: Pixel, systemId: string) => {
    const dieId = () => pixel.pixelId?.toString() || 'unknown';

    pixel.addEventListener('roll', (faceIndex: number) => {
      console.log('[Pixels Roll20 Hub] 🎲 Roll event received:', faceIndex);
      chrome.runtime.sendMessage({
        type: 'diceRoll',
        dieId: dieId(),
        face: faceIndex,
        dieType: pixel.type || 'd20'
      }).catch(err => console.error('[Pixels Roll20] Failed to send roll:', err));
    });

    pixel.addEventListener('rollState', (rollState: any) => {
      const state = rollState?.state;
      const isRolling = state === 'rolling' || state === 'handling';
      chrome.runtime.sendMessage({
        type: 'dieStatus',
        dieId: dieId(),
        isRolling,
        status: state === 'crooked' ? 'crooked' : pixel.status
      }).catch(() => { });
    });

    pixel.addEventListener('battery', () => {
      chrome.runtime.sendMessage({
        type: 'updateDieBattery',
        dieId: dieId(),
        battery: pixel.batteryLevel,
        isCharging: pixel.isCharging
      }).catch(() => { });
      upsertSaved({ systemId, battery: pixel.batteryLevel });
      updateUI();
    });

    pixel.addEventListener('statusChanged', (ev: any) => {
      const status = ev?.status;
      chrome.runtime.sendMessage({
        type: 'dieStatus',
        dieId: dieId(),
        isRolling: false,
        status
      }).catch(() => { });

      if (status === 'ready') {
        // A clean connection resets the backoff so the next drop retries quickly.
        backoffRef.current.delete(systemId);
        clearReconnectTimer(systemId);
      } else if (status === 'disconnected') {
        // Unexpected drop: keep the die visible and start trying to get it back,
        // unless the user removed it or we're already mid-attempt.
        if (!suppressedRef.current.has(systemId) && !reconnectingRef.current.has(systemId)) {
          scheduleReconnect(systemId);
        }
      }
      updateUI();
    });

    (pixel as any).addEventListener('rssi', (ev: { rssi: number }) => {
      chrome.runtime.sendMessage({
        type: 'dieStatus',
        dieId: dieId(),
        status: pixel.status,
        rssi: ev.rssi
      }).catch(() => { });
      updateUI();
    });
  }, [updateUI, upsertSaved, scheduleReconnect, clearReconnectTimer]);

  // ---- Connection ----------------------------------------------------------

  // Number of dice currently in a live "ready" connection — used to tell apart a
  // single out-of-range die from having saturated the adapter's connection slots.
  const countReadyDice = (): number => {
    let n = 0;
    for (const p of activeDiceRef.current.values()) {
      if (p.status === 'ready') n++;
    }
    return n;
  };

  const friendlyError = (error: any): string => {
    const raw = error?.message || String(error);
    const name = (error?.pixel?.name as string) || '';
    // BLE error 19 (0x13) is surfaced both for an out-of-range/asleep die and when the
    // computer's Bluetooth adapter has run out of connection slots — same code, different
    // cause. Lead with the common case and add a limit hint when several dice are already up.
    const isConnFailure = /\(19\)|code\s*19|reason\s*19|connection attempt failed|out of range|gatt/i.test(raw);
    if (!isConnFailure) return raw;

    const prefix = name ? `${name}: ` : '';
    let msg = `${prefix}Couldn't connect. This usually means the die is out of range or asleep — pick it up or give it a shake to wake it, then try again.`;
    const connected = countReadyDice();
    if (connected >= 4) {
      msg += ` If it's definitely awake and nearby, your computer's Bluetooth may have reached its limit for simultaneous connections (commonly around 7 — you have ${connected} connected right now). That's a hardware limit of the Bluetooth adapter, not the extension; connecting fewer dice or trying a different adapter is the only workaround.`;
    }
    return msg;
  };

  const connectWithRetry = useCallback(async (systemId: string, manual: boolean): Promise<boolean> => {
    if (suppressedRef.current.has(systemId)) return false;

    const existing = activeDiceRef.current.get(systemId);
    if (existing && existing.status === 'ready') return true;
    if (reconnectingRef.current.has(systemId) && !manual) return false;

    markReconnecting(systemId, true);
    clearReconnectTimer(systemId);

    try {
      const pixel = existing ?? await getPixel(systemId);
      if (!pixel) {
        throw new Error('This die is no longer available to the browser. Try pairing it again.');
      }

      console.log('[Pixels Roll20 Hub] Connecting to:', systemId);
      await repeatConnect(pixel, { retries: 3 });

      // Success: reset backoff and register everywhere.
      backoffRef.current.delete(systemId);
      setActiveDice(prev => {
        const next = new Map(prev);
        next.set(systemId, pixel);
        return next;
      });

      const dieIdStr = pixel.pixelId?.toString() || 'unknown';
      const dieType = (pixel as any).dieType || 'd20';

      chrome.runtime.sendMessage({
        type: 'registerDie',
        dieId: dieIdStr,
        dieName: pixel.name,
        dieType,
        colorway: pixel.colorway
      }).catch(() => { });

      await upsertSaved({
        systemId,
        pixelId: dieIdStr,
        name: pixel.name,
        dieType,
        colorway: pixel.colorway,
        battery: pixel.batteryLevel
      });

      if (!listenersAttachedRef.current.has(systemId)) {
        setupPixelListeners(pixel, systemId);
        listenersAttachedRef.current.add(systemId);
      }

      pixel.reportRssi(true, 5000).catch(() => { });

      chrome.runtime.sendMessage({
        type: 'dieStatus',
        dieId: dieIdStr,
        isRolling: false,
        status: pixel.status
      }).catch(() => { });

      return true;
    } catch (error) {
      console.error('[Pixels Roll20] Connection error:', error);
      if (manual) setConnectError(friendlyError(error));
      // Keep trying quietly in the background until the die comes back.
      scheduleReconnect(systemId);
      return false;
    } finally {
      markReconnecting(systemId, false);
    }
  }, [markReconnecting, clearReconnectTimer, upsertSaved, setupPixelListeners, scheduleReconnect]);

  // Expose the latest connectWithRetry to scheduleReconnect's timer callback.
  useEffect(() => { connectRef.current = connectWithRetry; }, [connectWithRetry]);

  const handleReconnect = useCallback((systemId: string) => {
    suppressedRef.current.delete(systemId);
    backoffRef.current.delete(systemId);
    connectWithRetry(systemId, true);
  }, [connectWithRetry]);

  // Forget a die entirely: disconnect, stop auto-reconnecting, drop it from
  // storage and revoke the browser permission so it isn't rediscovered.
  const handleForget = useCallback(async (systemId: string) => {
    suppressedRef.current.add(systemId);
    clearReconnectTimer(systemId);
    backoffRef.current.delete(systemId);
    listenersAttachedRef.current.delete(systemId);

    const pixel = activeDiceRef.current.get(systemId);
    const savedEntry = savedRef.current.find(d => d.systemId === systemId);
    const pixelId = pixel?.pixelId?.toString() || savedEntry?.pixelId;

    if (pixel) pixel.disconnect().catch(() => { });
    if (pixelId) chrome.runtime.sendMessage({ type: 'disconnect', dieId: pixelId }).catch(() => { });

    setActiveDice(prev => {
      const next = new Map(prev);
      next.delete(systemId);
      return next;
    });

    await removeSaved(systemId);

    try {
      const nav = navigator as any;
      if (nav.bluetooth?.getDevices) {
        const devices = await nav.bluetooth.getDevices();
        const device = devices.find((d: any) => d.id === systemId);
        if (device?.forget) await device.forget();
      }
    } catch (e) {
      console.log('[Pixels Roll20] Could not forget device permission:', e);
    }
  }, [clearReconnectTimer, removeSaved]);

  const startPairing = useCallback(async () => {
    setIsPairing(true);
    try {
      const pixel = await requestPixel();
      if (pixel) {
        suppressedRef.current.delete(pixel.systemId);
        await upsertSaved({ systemId: pixel.systemId, name: pixel.name });
        await connectWithRetry(pixel.systemId, true);
      }
    } catch (error: any) {
      console.error('[Pixels Roll20] Pairing failed:', error);
      if (!String(error?.message || '').toLowerCase().includes('cancelled')) {
        setConnectError(friendlyError(error));
      }
    } finally {
      setIsPairing(false);
    }
  }, [upsertSaved, connectWithRetry]);

  // ---- Discovery -----------------------------------------------------------

  const discoverAndConnect = useCallback(async () => {
    const nav = navigator as any;
    if (!nav.bluetooth || !nav.bluetooth.getDevices) {
      setShowBluetoothFlag(true);
      return;
    }

    let granted: any[] = [];
    try {
      granted = await nav.bluetooth.getDevices();
    } catch (e) {
      console.error('[Pixels Roll20] Discovery error:', e);
      return;
    }

    const savedList = await refreshSaved();
    const savedIds = new Set(savedList.map(d => d.systemId));
    const grantedIds = new Set(granted.map(d => d.id));

    // First run with granted devices but nothing saved yet (e.g. upgrading from an
    // older version): adopt them so they keep working and auto-reconnecting.
    if (savedIds.size === 0 && grantedIds.size > 0) {
      for (const device of granted) {
        if (suppressedRef.current.has(device.id)) continue; // don't re-adopt a just-forgotten die
        await upsertSaved({ systemId: device.id, name: device.name });
        savedIds.add(device.id);
      }
    }

    for (const systemId of savedIds) {
      if (suppressedRef.current.has(systemId)) continue;
      if (!grantedIds.has(systemId)) continue; // permission no longer present
      const existing = activeDiceRef.current.get(systemId);
      if (existing && existing.status === 'ready') continue;
      if (reconnectTimersRef.current.has(systemId)) continue; // backoff already pending
      connectWithRetry(systemId, false);
    }
  }, [refreshSaved, upsertSaved, connectWithRetry]);

  useEffect(() => {
    refreshSaved();
    discoverAndConnect();

    // Periodically re-scan so dice that were off/out of range reconnect on their own.
    const interval = setInterval(discoverAndConnect, REDISCOVER_INTERVAL);

    chrome.runtime.sendMessage({ type: 'getDiceStatus' }, (response) => {
      if (Array.isArray(response)) setHubDice(response);
    });

    const messageListener = (message: any, _sender: any, sendResponse: any) => {
      if (message.type === 'diceStatusUpdate' && Array.isArray(message.dice)) {
        setHubDice(message.dice);
        return;
      }
      if (message.type === 'dieStatusChanged') {
        chrome.runtime.sendMessage({ type: 'getDiceStatus' }, (r) => {
          if (Array.isArray(r)) setHubDice(r);
        });
      }
      if (message.type === 'connectToPixel') {
        handleReconnect(message.systemId);
        sendResponse({ success: true });
        return true;
      }
      // Popup-initiated disconnect arrives keyed by pixelId.
      if (message.type === 'forgetByPixelId') {
        const entry = savedRef.current.find(d => d.pixelId === String(message.pixelId));
        let systemId = entry?.systemId;
        if (!systemId) {
          for (const [sid, p] of activeDiceRef.current) {
            if (p.pixelId?.toString() === String(message.pixelId)) { systemId = sid; break; }
          }
        }
        if (systemId) handleForget(systemId);
        sendResponse({ success: true });
        return false;
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up any pending reconnect timers on unmount.
  useEffect(() => {
    const timers = reconnectTimersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const copyFlag = () => {
    const url = 'chrome://flags/#enable-web-bluetooth-new-permissions-backend';
    navigator.clipboard.writeText(url).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  // ---- Render --------------------------------------------------------------

  // Merge live connections with saved-but-disconnected dice into one list.
  const rowIds = Array.from(new Set([...saved.map(d => d.systemId), ...Array.from(activeDice.keys())]));

  const rows = rowIds.map((systemId) => {
    const pixel = activeDice.get(systemId);
    const info = saved.find(d => d.systemId === systemId);
    const pixelId = pixel?.pixelId?.toString() || info?.pixelId;
    const hubDie = pixelId ? hubDice.find(d => d.dieId === pixelId) : undefined;
    const isReconnecting = reconnecting.has(systemId);
    const status = pixel ? (hubDie?.status || pixel.status) : 'disconnected';

    const die = {
      dieId: pixelId || systemId,
      name: pixel?.name || info?.name || 'Pixels Die',
      dieType: (pixel as any)?.dieType || info?.dieType || 'd20',
      battery: pixel?.batteryLevel ?? hubDie?.battery ?? info?.battery ?? 0,
      isCharging: pixel?.isCharging ?? false,
      rssi: (pixel as any)?.rssi ?? hubDie?.rssi,
      status,
      colorway: pixel?.colorway || info?.colorway,
      isRolling: hubDie?.isRolling ?? false,
      lastResult: hubDie?.lastResult
    };

    return { systemId, die, isReconnecting };
  });

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tight mb-2">Connected Dice</h2>
          <p className="text-text-muted opacity-60">Manage your Pixels and track their real-time state.</p>
        </div>
        <Button onClick={startPairing} className="bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/20 px-6 py-3 font-black uppercase tracking-widest text-sm flex items-center gap-2">
          {isPairing ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} strokeWidth={3} />}
          Pair New Die
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.length === 0 ? (
          <div className="col-span-2 text-center py-20 bg-surface/30 rounded-3xl border-2 border-dashed border-white/5">
            <Bluetooth size={48} className="mx-auto text-text-muted opacity-20 mb-4" />
            <p className="text-text-muted italic">No dice paired yet. Click “Pair New Die” to get started.</p>
          </div>
        ) : (
          rows.map(({ systemId, die, isReconnecting }) => (
            <DieRow
              key={systemId}
              die={die}
              onDisconnect={() => handleForget(systemId)}
              onReconnect={() => handleReconnect(systemId)}
              isReconnecting={isReconnecting}
              showSignal={true}
            />
          ))
        )}
      </div>

      {showBluetoothFlag && (
        <Card className="bg-warning/5 border-warning/20">
          <div className="flex gap-4">
            <Info className="text-warning shrink-0" size={24} />
            <div className="text-sm">
              <strong className="block mb-1 text-warning uppercase font-black text-xs tracking-widest">Optional: Persistent Reconnection</strong>
              <p className="text-text-muted leading-relaxed mb-4">
                Dice reconnect automatically while this tab is open. To let the browser remember them across full restarts, enable this Chrome flag:
              </p>
              <div className="bg-black/50 p-3 rounded-xl flex items-center justify-between font-mono text-xs mb-3 border border-white/5">
                <span className="truncate mr-4 opacity-70 italic">chrome://flags/#enable-web-bluetooth-new-permissions-backend</span>
                <button onClick={copyFlag} className="p-2 hover:bg-white/10 rounded-lg transition-colors shrink-0 text-accent" title="Copy Flag URL">
                  {isCopied ? <CheckCircle2 size={16} /> : <Plus size={16} className="rotate-45" />}
                </button>
              </div>
              <p className="text-[0.7rem] opacity-50">Copy to your address bar, set to <b>Enabled</b>, and restart Chrome.</p>
            </div>
          </div>
        </Card>
      )}

      <Modal
        isOpen={!!connectError}
        onClose={() => setConnectError(null)}
        title="Connection Error"
        variant="warning"
        actions={<Button onClick={() => setConnectError(null)}>Got it</Button>}
      >
        <p>{connectError}</p>
      </Modal>
    </div>
  );
};

export default DiceTab;
