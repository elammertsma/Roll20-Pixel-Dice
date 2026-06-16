export {};

// Centralized persistence keys
const STORAGE_KEYS = {
  HUB_TAB_ID: 'hub_tab_id',
  REGISTERED_DICE: 'registered_dice_hub_status'
};

// Internal cache (to avoid excessive async calls, but backed by storage)
let cachedHubTabId: number | null = null;
let diceMapCache: Map<string, DieStatus> = new Map();

// Helper to refresh state from storage
async function initializeHub(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.HUB_TAB_ID, STORAGE_KEYS.REGISTERED_DICE]);
    
    // Verify stored tab still exists
    if (result[STORAGE_KEYS.HUB_TAB_ID] !== undefined) {
      const storedId = result[STORAGE_KEYS.HUB_TAB_ID];
      try {
        await chrome.tabs.get(storedId);
        cachedHubTabId = storedId;
        console.log('[Pixels Roll20 Hub] Restored and verified hubTabId:', cachedHubTabId);
      } catch {
        console.log('[Pixels Roll20 Hub] Stored hubTabId no longer exists, clearing.');
        await chrome.storage.local.remove(STORAGE_KEYS.HUB_TAB_ID);
        cachedHubTabId = null;
      }
    }
    
    // Restore dice map
    if (result[STORAGE_KEYS.REGISTERED_DICE]) {
      const savedDice = result[STORAGE_KEYS.REGISTERED_DICE] as DieStatus[];
      diceMapCache = new Map(savedDice.map(d => [d.dieId, d]));
      console.log('[Pixels Roll20 Hub] Restored dice cache:', diceMapCache.size);
    }
  } catch (error) {
    console.error('[Pixels Roll20 Hub] Error initializing hub:', error);
  }
}

// Immediately initialize
initializeHub();

async function ensureHubTab(): Promise<number> {
  const url = chrome.runtime.getURL('hub.html');
  
  // 1. Check if it's already open
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('hub.html*') });
  if (tabs.length > 0 && tabs[0].id !== undefined) {
    cachedHubTabId = tabs[0].id;
    await chrome.storage.local.set({ [STORAGE_KEYS.HUB_TAB_ID]: cachedHubTabId });
    return cachedHubTabId;
  }

  // 2. Find a Roll20 tab to place the hub next to
  const roll20Tabs = await chrome.tabs.query({ url: '*://app.roll20.net/*' });
  const activeRoll20 = roll20Tabs.find(t => t.active) || roll20Tabs[0];

  // 3. Create it as a regular tab, ideally next to Roll20
  const tab = await chrome.tabs.create({
    url,
    pinned: false,
    active: false,
    index: activeRoll20 ? activeRoll20.index + 1 : undefined,
    windowId: activeRoll20 ? activeRoll20.windowId : undefined
  });

  if (tab.id === undefined) {
    throw new Error('Failed to create hub tab');
  }

  cachedHubTabId = tab.id;
  await chrome.storage.local.set({ [STORAGE_KEYS.HUB_TAB_ID]: cachedHubTabId });
  console.log('[Pixels Roll20 Hub] Hub tab created (unpinned) next to Roll20');
  
  // Wait a moment for the hub to initialize its message listeners
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return cachedHubTabId!;
}

interface DieStatus {
  dieId: string;
  name: string;
  battery: number;
  dieType: string;
  isRolling: boolean;
  status: string; // 'ready', 'connecting', 'disconnected', etc.
  isCharging?: boolean;
  lastResult?: number | null;
  colorway?: string;
  rssi?: number;
}

interface RegisterDieMessage {
  type: 'registerDie';
  dieId: string;
  dieName: string;
  dieType: string;
}

interface DiceRollMessage {
  type: 'diceRoll';
  dieId: string;
  face: number;
  dieType: string;
}

interface DisconnectMessage {
  type: 'disconnect';
  dieId: string;
}

interface GetStatusMessage {
  type: 'getDiceStatus';
}

interface DieStatusMessage {
  type: 'dieStatus';
  dieId: string;
  isRolling: boolean;
}

type Message = RegisterDieMessage | DiceRollMessage | DisconnectMessage | GetStatusMessage | DieStatusMessage;

interface PendingRoll {
  dieId: string;
  face: number;
  dieType: string;
  timestamp: number;
}

let pendingRoll: PendingRoll | null = null;
let pendingRollTimeout: any = null;

const STAT_MAP: Record<string, string> = {
  'str': 'strength',
  'dex': 'dexterity',
  'con': 'constitution',
  'int': 'intelligence',
  'wis': 'wisdom',
  'cha': 'charisma'
};

class DiceManager {
  registerDie(dieId: string, dieName: string, dieType: string, colorway?: string): void {
    diceMapCache.set(dieId, {
      dieId: dieId,
      name: dieName,
      dieType: dieType,
      battery: 100,
      isRolling: false,
      status: 'ready',
      colorway
    });
    console.log(`[Pixels Roll20 Hub] Registered die: ${dieName} (${dieId})`);
    this.persistAndNotify();
  }

  private rollWatchdogs: Map<string, any> = new Map();

  updateDieStatus(dieId: string, isRolling: boolean, status?: string, rssi?: number): void {
    const die = diceMapCache.get(dieId);
    if (die) {
      if (this.rollWatchdogs.has(dieId)) {
        clearTimeout(this.rollWatchdogs.get(dieId));
        this.rollWatchdogs.delete(dieId);
      }

      die.isRolling = isRolling;
      if (status) die.status = status;
      if (rssi !== undefined) die.rssi = rssi;

      if (isRolling) {
        this.rollWatchdogs.set(dieId, setTimeout(() => {
          const d = diceMapCache.get(dieId);
          if (d && d.isRolling) {
            console.log(`[Pixels Roll20] ⌚ Watchdog: Die ${dieId} rolling for >10s, forcing stop.`);
            d.isRolling = false;
            this.persistAndNotify();
          }
          this.rollWatchdogs.delete(dieId);
        }, 10000));
      }

      this.persistAndNotify();
    }
  }

  updateDieBattery(dieId: string, battery: number, isCharging?: boolean): void {
    const die = diceMapCache.get(dieId);
    if (die) {
      die.battery = battery;
      die.isCharging = isCharging;
      this.persistAndNotify();
    }
  }

  private persistAndNotify(): void {
    const diceArray = Array.from(diceMapCache.values());
    chrome.storage.local.set({ [STORAGE_KEYS.REGISTERED_DICE]: diceArray }).then(() => {
      chrome.runtime.sendMessage({ 
        type: 'diceStatusUpdate',
        dice: diceArray
      }).catch(() => {});
    });
  }

  clearAllDice(): void {
    diceMapCache.clear();
    chrome.storage.local.remove(STORAGE_KEYS.REGISTERED_DICE).then(() => {
      chrome.runtime.sendMessage({ type: 'dieStatusChanged' }).catch(() => {});
    });
    console.log('[Pixels Roll20 Hub] All dice cleared');
  }

  getDiceStatus(): DieStatus[] {
    return Array.from(diceMapCache.values());
  }

  async disconnectDie(dieId: string): Promise<void> {
    diceMapCache.delete(dieId);
    await chrome.storage.local.set({ [STORAGE_KEYS.REGISTERED_DICE]: Array.from(diceMapCache.values()) });
    this.persistAndNotify();

    console.log(`[Pixels Roll20 Hub] Disconnected die: ${dieId}`);

    // Remove from saved dice so it doesn't auto connect
    chrome.storage.local.get(['savedDice'], (result) => {
      const saved = result.savedDice || [];
      const updated = saved.filter((id: string) => id !== dieId);
      chrome.storage.local.set({ savedDice: updated });
    });

    // Tell Hub tab
    if (cachedHubTabId !== null) {
      chrome.tabs.sendMessage(cachedHubTabId, {
        target: 'bridge',
        type: 'disconnectPixel',
        systemId: dieId
      }).catch(() => {
        console.log('[Pixels Roll20 Hub] Hub tab might already be closed');
      });
    }
  }

  private lastDiceRolls: Map<string, { face: number; timestamp: number }> = new Map();

  async onDieRoll(dieId: string, faceValue: number, dieType: string): Promise<void> {
    const timestamp = Date.now();
    console.log(`[Pixels Roll20] Die rolled: ${dieType} with face ${faceValue} at ${timestamp}`);
    
    // 0. Duplicate Protection (Ignore identical results from same die within 1s)
    const lastRoll = this.lastDiceRolls.get(dieId);
    if (lastRoll && (timestamp - lastRoll.timestamp < 1000) && lastRoll.face === faceValue) {
      console.log(`[Pixels Roll20] 🛡️ Ignoring duplicate roll event from ${dieId} (Face: ${faceValue})`);
      return;
    }
    this.lastDiceRolls.set(dieId, { face: faceValue, timestamp });

    // 1. Update local status
    const die = diceMapCache.get(dieId);
    if (die) {
      die.lastResult = faceValue;
      die.isRolling = false;
      this.persistAndNotify();
      
      setTimeout(() => {
        if (die.lastResult === faceValue) {
          die.lastResult = null;
          this.persistAndNotify();
        }
      }, 6000);
    }

    // 2. Get the current configuration from storage
    chrome.storage.local.get(['lastSelectedMessageType', 'customRollTemplate', 'customMessageTypes', 'modifierConfig', 'hubSettings'], async (result) => {
      const config = result.modifierConfig || { advantageMode: 'normal', modifierSource: 'none' };
      const settings = result.hubSettings || { digitalAdvantage: false };
      
      let rollFormula = '/roll #face_value'; 
      const selectedType = result.lastSelectedMessageType;

      try {
        // Resolve roll formula
        if (selectedType && selectedType !== 'custom') {
          if (result.customMessageTypes && result.customMessageTypes[selectedType]) {
            rollFormula = result.customMessageTypes[selectedType].formula;
          } else {
            try {
              const fileUrl = chrome.runtime.getURL(`messageTypes/${selectedType}.json`);
              const response = await fetch(fileUrl);
              const data = await response.json();
              const messageData = data.message || data.roll;
              if (messageData && messageData.formula) {
                rollFormula = messageData.formula;
              }
            } catch (err) {
              rollFormula = result.customRollTemplate || rollFormula;
            }
          }
        } else if (result.customRollTemplate) {
          rollFormula = result.customRollTemplate;
        }

        // Construct Modifier string
        let modStr = '';
        if (config.modifierSource !== 'none' && config.modifierKey) {
          const key = config.modifierKey;
          const fullKey = STAT_MAP[key] || key;
          if (config.modifierSource === 'stat') modStr += ` + @{selected|${fullKey}_mod}`;
          else if (config.modifierSource === 'save') modStr += ` + @{selected|${fullKey}_save_bonus}`;
          else if (config.modifierSource === 'skill') modStr += ` + @{selected|${key}_bonus}`;
        }
        if (config.manualModifier) {
          const val = parseInt(config.manualModifier);
          if (!isNaN(val) && val !== 0) {
            modStr += ` ${val > 0 ? '+' : ''}${val}`;
          }
        }
        if (config.customModifierSum) {
          const val = parseInt(config.customModifierSum);
          if (!isNaN(val) && val !== 0) {
            modStr += ` ${val > 0 ? '+' : ''}${val}`;
          }
        }

        // --- Handle Advantage / Disadvantage ---
        const mode = config.advantageMode || 'normal';
        
        // 1500ms Simultaneous detection (Must be TWO DIFFERENT dice of the same type)
        if (mode !== 'normal' && pendingRoll && (timestamp - pendingRoll.timestamp < 1500) && (pendingRoll.dieType === dieType) && (pendingRoll.dieId !== dieId)) {
          console.log('[Pixels Roll20] Simultaneous roll detected, merging.');
          if (pendingRollTimeout) clearTimeout(pendingRollTimeout);
          const r1 = pendingRoll.face;
          const r2 = faceValue;
          pendingRoll = null;
          chrome.runtime.sendMessage({ type: 'waitingForSecondRoll', waiting: false }).catch(() => {});
          this.sendToRoll20(dieId, dieType, rollFormula, r1, r2, mode, modStr);
          return;
        }

        if (mode === 'normal') {
          this.sendToRoll20(dieId, dieType, rollFormula, faceValue, null, 'normal', modStr);
        } else {
          // Advantage or Disadvantage
          if (settings.digitalAdvantage) {
            this.sendToRoll20(dieId, dieType, rollFormula, faceValue, null, mode, modStr, true);
          } else {
            // Physical Advantage (Sequential)
            if (!pendingRoll) {
              pendingRoll = { dieId, face: faceValue, dieType, timestamp };
              chrome.runtime.sendMessage({ type: 'waitingForSecondRoll', waiting: true }).catch(() => {});
              
              // Notify Roll20 that roll 1 is in
              const die = diceMapCache.get(dieId);
              this.sendInterimMessage(die ? die.name : 'Pixel Die', faceValue);
              
              // Reset after 30s
              if (pendingRollTimeout) clearTimeout(pendingRollTimeout);
              pendingRollTimeout = setTimeout(() => {
                if (pendingRoll) {
                  console.log('[Pixels Roll20] Advantage timeout, sending single roll.');
                  this.sendToRoll20(pendingRoll.dieId, pendingRoll.dieType, rollFormula, pendingRoll.face, null, 'normal', modStr);
                  pendingRoll = null;
                  chrome.runtime.sendMessage({ type: 'waitingForSecondRoll', waiting: false }).catch(() => {});
                }
              }, 30000);
            } else {
              // Already have one roll pending (but didn't hit simultaneous window or same die)
              if (pendingRollTimeout) clearTimeout(pendingRollTimeout);
              const r1 = pendingRoll.face;
              const r2 = faceValue;
              pendingRoll = null;
              chrome.runtime.sendMessage({ type: 'waitingForSecondRoll', waiting: false }).catch(() => {});
              this.sendToRoll20(dieId, dieType, rollFormula, r1, r2, mode, modStr);
            }
          }
        }
      } catch (error) {
        console.error('[Pixels Roll20] Error in onDieRoll:', error);
      }
    });
  }

  private sendInterimMessage(dieName: string, faceValue: number): void {
    chrome.tabs.query({ url: '*://app.roll20.net/*' }, (tabs) => {
      const roll20Tab = tabs.find(t => t.url?.includes('app.roll20.net'));
      if (roll20Tab?.id) {
        chrome.tabs.sendMessage(roll20Tab.id, {
          type: 'diceRoll',
          rollMessage: `/me [${dieName}] Roll 1: **${faceValue}**. Waiting for 2nd die...`
        });
      }
    });
  }

  private async sendToRoll20(
    dieId: string, 
    dieType: string, 
    rollFormula: string, 
    r1Value: number, 
    r2Value: number | null, 
    mode: 'normal' | 'advantage' | 'disadvantage', 
    modStr: string,
    useDigitalSecondDie: boolean = false
  ): Promise<void> {
    let rollMessage = rollFormula;
    const die = diceMapCache.get(dieId);
    const dieName = die ? die.name : 'Pixel Die';
    const finalDieType = die ? die.dieType : dieType;

    // 1. Replace #die_name and #die_type basic placeholders
    rollMessage = rollMessage.replace(/#die_name/g, dieName);
    rollMessage = rollMessage.replace(/#die_type/g, finalDieType);

    // 2. Determine injection style
    const hasStyling = rollMessage.includes(' style=');
    const isSimpleTemplate = rollMessage.includes('template:simple');

    // Helper to generate a Roll20 inline roll with crit/fumble styling and better tooltips
    const generateRoll = (val: number, mod: string) => {
      const dSize = parseInt(finalDieType.replace(/\D/g, '') || '20');
      const dieLabel = `[1d${dSize}]`;
      
      if (val === dSize) {
        // Critical Success: 1d1cs1cf0 always "crits" -> forces Roll20's green box.
        // The label must sit on the (val-1) term, NOT directly on the cs/cf die:
        // a tag placed right after the crit die swallows the trailing "+ (val-1)",
        // which made a crit 20 render as 1. Mirrors the normal branch's (val)[label].
        return `[[ 1d1cs1cf0 + (${val - 1})${dieLabel} ${mod} ]]`;
      } else if (val === 1) {
        // Critical Failure: 1d1cs0cf1 always "fumbles" -> forces Roll20's red box.
        return `[[ 1d1cs0cf1 + (${val - 1})${dieLabel} ${mod} ]]`;
      } else {
        // Normal roll
        return `[[ (${val})${dieLabel} ${mod} ]]`;
      }
    };

    // 3. Handle Template Surgical Operations
    if (isSimpleTemplate) {
      // Clear all mode flags
      rollMessage = rollMessage.replace(/{{normal=1}}/g, '').replace(/{{advantage=1}}/g, '').replace(/{{disadvantage=1}}/g, '');
      rollMessage += (mode === 'advantage' ? ' {{advantage=1}}' : mode === 'disadvantage' ? ' {{disadvantage=1}}' : ' {{normal=1}}');

      // Replace or Add r1
      const r1Roll = generateRoll(r1Value, modStr);
      if (rollMessage.includes('#face_value')) {
        // Find if #face_value is inside an old styled link hack and replace the whole link
        const linkPattern = /\[#face_value\]\(#"[^)]*\)/;
        if (linkPattern.test(rollMessage)) {
           rollMessage = rollMessage.replace(linkPattern, r1Roll);
        } else {
           rollMessage = rollMessage.replace(/#face_value/g, r1Roll);
        }
      } else if (rollMessage.includes('{{r1=')) {
        rollMessage = rollMessage.replace(/{{r1=[^}]*}}/, `{{r1=${r1Roll}}}`);
      }

      // Add/Update r2
      if (mode !== 'normal') {
        let r2Content = '';
        if (useDigitalSecondDie) {
          const dSize = finalDieType.replace(/\D/g,'') || '20';
          r2Content = `[[1d${dSize} ${modStr}]]`;
        } else {
          r2Content = generateRoll(r2Value || 0, modStr);
        }

        if (rollMessage.includes('{{r2=')) {
          rollMessage = rollMessage.replace(/{{r2=[^}]*}}/, `{{r2=${r2Content}}}`);
        } else {
          rollMessage += ` {{r2=${r2Content}}}`;
        }
      }
    } else {
      // Non-simple template (like atk)
      const r1Roll = generateRoll(r1Value, modStr);
      rollMessage = rollMessage.replace(/#face_value/g, r1Roll);
    }

    console.log(`[Pixels Roll20] Sending (${mode}):`, rollMessage);

    chrome.tabs.query({ url: '*://app.roll20.net/*' }, (tabs) => {
      const roll20Tab = tabs.find(t => t.url?.includes('app.roll20.net'));
      if (roll20Tab?.id) {
        chrome.tabs.sendMessage(roll20Tab.id, {
          type: 'diceRoll',
          face: r1Value,
          dieType,
          rollMessage
        }, (res) => {
           if (chrome.runtime.lastError) {
             chrome.scripting.executeScript({ target: { tabId: roll20Tab.id! }, files: ['content.js'] }).then(() => {
                setTimeout(() => chrome.tabs.sendMessage(roll20Tab.id!, { type: 'diceRoll', rollMessage }), 100);
             });
           } else if (res && res.success === false) {
             console.warn('[Pixels Roll20] Content script failed to inject roll.');
             chrome.runtime.sendMessage({ 
               type: 'rollError', 
               error: 'Roll20 chat not found. Ignoring roll.' 
             }).catch(() => {});
           }
        });
      }
    });
  }
}

const diceManager = new DiceManager();

// Message handler
chrome.runtime.onMessage.addListener((
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => {
  const msg = message as any;

  if (!msg || typeof msg !== 'object' || !msg.type) {
    return false;
  }

  switch (msg.type) {
    case 'registerDie':
      diceManager.registerDie(msg.dieId, msg.dieName, msg.dieType);
      sendResponse({ success: true });
      return false;

    case 'diceRoll':
      diceManager.onDieRoll(msg.dieId, msg.face, msg.dieType);
      return false;

    case 'dieStatus':
      diceManager.updateDieStatus(msg.dieId, msg.isRolling, msg.status);
      return false;

    case 'updateDieBattery':
      diceManager.updateDieBattery(msg.dieId, msg.battery, msg.isCharging);
      return false;

    case 'connectDie':
      console.log('[Pixels Roll20] Background received connectDie for systemId:', msg.systemId);
      ensureHubTab().then((tabId) => {
        chrome.tabs.sendMessage(tabId, {
          target: 'bridge',
          type: 'connectToPixel',
          systemId: msg.systemId
        });
      });
      return false;

    case 'disconnect':
      diceManager.disconnectDie(msg.dieId);
      sendResponse({ success: true });
      return false;

    case 'getDiceStatus':
      sendResponse(diceManager.getDiceStatus());
      return false;

    default:
      return false;
  }
});

// Auto-open popup when user switches back to Roll20 tabs
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    tryOpenPopup(tab);
  });
});

// Auto connect to saved dice on startup
chrome.runtime.onStartup.addListener(autoConnectDice);
chrome.runtime.onInstalled.addListener(autoConnectDice);

function autoConnectDice() {
  chrome.storage.local.get(['savedDice'], (result) => {
    const saved = result.savedDice || [];
    if (saved.length > 0) {
      console.log('[Pixels Roll20] Auto-opening hub for saved dice:', saved);
      ensureHubTab();
      // The hub handles its own discovery via autoDiscoverDice()
    }
  });
}

// Helper to attempt opening the popup action
function tryOpenPopup(tab: chrome.tabs.Tab) {
  if (tab.url && tab.url.includes('app.roll20.net/editor')) {
    chrome.storage.local.get(['hubSettings'], (result) => {
      const settings = result.hubSettings || { autoOpenPopup: true, autoOpenHub: true };
      if (!settings.autoOpenPopup) return;

      console.log('[Pixels Roll20] Attempting to auto-open popup for Roll20');
      try {
        chrome.action.openPopup();
        // If enabled, ensure the Hub tab is also open (discretely in the background)
        if (settings.autoOpenHub !== false) {
          ensureHubTab();
        }
      } catch (error) {
        // This often fails in MV3 without user gesture, but we try anyway
        console.log('[Pixels Roll20] Could not auto-open popup:', error);
      }
    });
  }
}

// Auto-open when tab is updated (refreshed or loaded)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('app.roll20.net/editor')) {
    tryOpenPopup(tab);
  }
});

// Auto-close hub tab when all Roll20 tabs are closed
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  // If the hub tab itself is closed, clear all dice from the hub
  if (tabId === cachedHubTabId) {
    console.log('[Pixels Roll20 Hub] Hub tab closed manually, clearing all dice status');
    diceManager.clearAllDice();
    cachedHubTabId = null;
    await chrome.storage.local.remove(STORAGE_KEYS.HUB_TAB_ID);
  }

  // Check if we still have any Roll20 tabs
  const roll20Tabs = await chrome.tabs.query({ url: '*://app.roll20.net/*' });
  
  if (roll20Tabs.length === 0) {
    console.log('[Pixels Roll20 Hub] No Roll20 tabs left, performing delayed hub cleanup');
    // Add small delay to survive refreshes
    setTimeout(async () => {
      const recheck = await chrome.tabs.query({ url: '*://app.roll20.net/*' });
      if (recheck.length === 0) {
        const hubTabs = await chrome.tabs.query({ url: chrome.runtime.getURL('hub.html*') });
        for (const tab of hubTabs) {
          if (tab.id) {
            console.log('[Pixels Roll20 Hub] Closing hub tab as no Roll20 tabs remain.');
            chrome.tabs.remove(tab.id).catch(() => {});
          }
        }
        cachedHubTabId = null;
        await chrome.storage.local.remove(STORAGE_KEYS.HUB_TAB_ID);
      }
    }, 2000);
  }
});
