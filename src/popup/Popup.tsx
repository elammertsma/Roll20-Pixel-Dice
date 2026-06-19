import React, { useState, useEffect, useCallback } from 'react';
import { Dice1, Plus, Settings, Shield, User, Book, Trash2, XCircle, RefreshCw, Dice5, ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Card, BatteryIcon, Logo, PhysicalDie, DieRow, Select, TextArea, Input, SupportButton, Modal } from '../components/UI';

interface DieStatus {
  dieId: string;
  name: string;
  battery: number;
  dieType: string;
  isRolling: boolean;
  status: string;
  isCharging?: boolean;
  lastResult?: number | null;
  colorway?: string;
  rssi?: number;
}

interface RollTemplate {
  name: string;
  formula: string;
}

interface CustomModifier {
  id: string;
  name: string;
  value: number;
  active: boolean;
}

const STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const SKILLS = [
  'acrobatics', 'animal_handling', 'arcana', 'athletics', 'deception',
  'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature',
  'perception', 'performance', 'persuasion', 'religion', 'sleight_of_hand',
  'stealth', 'survival'
];

const DieLabel: React.FC<{ die: DieStatus }> = ({ die }) => {
  const typeStr = die.dieType.toLowerCase().replace('pipped', '').replace('d', '');
  const dSize = parseInt(typeStr) || 20;
  const maxVal = typeStr === '00' ? 90 : dSize;
  const isCrit = die.lastResult === maxVal;
  const isFail = die.lastResult === 1;
  const isLowBattery = die.battery <= 20;

  let colorClass = 'text-text-muted opacity-40';
  let glowStyle = {};
  let content = die.dieType.toLowerCase().replace('pipped', '');

  if (die.isRolling) {
    colorClass = 'animate-rainbow';
    glowStyle = { textShadow: '0 0 12px rgba(188, 27, 132, 0.4)' };
  } else if (die.lastResult !== null && die.lastResult !== undefined) {
    content = die.lastResult.toString();
    colorClass = 'text-white animate-result-fade';
    glowStyle = { textShadow: '0 0 8px rgba(255, 255, 255, 0.4)' };

    if (isCrit) {
      colorClass = 'animate-crit-all';
      glowStyle = { textShadow: '0 0 12px rgba(253, 190, 15, 0.6)' };
    } else if (isFail) {
      colorClass = 'animate-result-fade';
      glowStyle = { 
        color: '#ec1b37',
        textShadow: '0 0 10px rgba(236, 27, 55, 0.6)' 
      };
    }
  } else if (isLowBattery) {
    colorClass = 'text-warning animate-pulse';
    glowStyle = { textShadow: '0 0 8px rgba(245, 158, 11, 0.4)' };
  }

  return (
    <span 
      className={`font-black overflow-visible uppercase tracking-tighter text-sm transition-all duration-300 inline-block ${colorClass}`}
      style={glowStyle}
      title={isLowBattery ? "Low battery" : `${die.name} (${die.battery}%)`}
    >
      {content}
    </span>
  );
};

const Popup: React.FC = () => {
  const [diceList, setDiceList] = useState<DieStatus[]>([]);
  const [rollTemplates, setRollTemplates] = useState<Map<string, RollTemplate>>(new Map());
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('');
  const [customModifiers, setCustomModifiers] = useState<CustomModifier[]>([]);
  const [isCustomModifiersOpen, setIsCustomModifiersOpen] = useState(false);

  // Modifiers State
  const [advantageMode, setAdvantageMode] = useState<'normal' | 'advantage' | 'disadvantage'>('normal');
  const [modifierSource, setModifierSource] = useState<'none' | 'stat' | 'save' | 'skill'>('none');
  const [modifierKey, setModifierKey] = useState<string>('');
  const [manualModifier, setManualModifier] = useState<number>(0);
  const [isWaitingForSecondRoll, setIsWaitingForSecondRoll] = useState<boolean>(false);
  const [rollError, setRollError] = useState<string | null>(null);

  // Update Dice List
  const updateDiceList = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getDiceStatus' });
      if (Array.isArray(response)) {
        setDiceList(response);
      }
    } catch (error) {
      console.error('[Pixels Roll20] Error updating dice list:', error);
    }
  }, []);

  // Load Message Types
  const loadMessageTypes = useCallback(async () => {
    try {
      const templates = new Map<string, RollTemplate>();

      const indexUrl = chrome.runtime.getURL('messageTypes/index.json');
      const indexResponse = await fetch(indexUrl);
      if (indexResponse.ok) {
        const messageTypeFiles: string[] = await indexResponse.json();
        for (const file of messageTypeFiles) {
          try {
            const fileUrl = chrome.runtime.getURL(`messageTypes/${file}`);
            const response = await fetch(fileUrl);
            if (response.ok) {
              const data = await response.json();
              const name = file.replace('.json', '');
              const messageData = data.message || data.roll;
              if (messageData && messageData.formula) {
                templates.set(name, {
                  name: messageData.name || name,
                  formula: messageData.formula
                });
              }
            }
          } catch (e) {
            console.error(`Error loading ${file}:`, e);
          }
        }
      }

      // Load custom message types from storage
      const result = await chrome.storage.local.get(['customMessageTypes']);
      const customTypes = result.customMessageTypes || {};
      for (const key of Object.keys(customTypes)) {
        templates.set(key, customTypes[key]);
      }

      setRollTemplates(templates);

      // Restore selection
      const stored = await chrome.storage.local.get(['lastSelectedMessageType', 'modifierConfig']);
      const lastKey = stored.lastSelectedMessageType;

      if (stored.modifierConfig) {
        setAdvantageMode(stored.modifierConfig.advantageMode || 'normal');
        setModifierSource(stored.modifierConfig.modifierSource || 'none');
        setModifierKey(stored.modifierConfig.modifierKey || '');
        setManualModifier(stored.modifierConfig.manualModifier || 0);
      }

      if (lastKey && templates.has(lastKey)) {
        setSelectedTemplateKey(lastKey);
      } else if (templates.has('Default')) {
        setSelectedTemplateKey('Default');
        // Ensure storage is updated with default if nothing was there
        const template = templates.get('Default')!;
        chrome.storage.local.set({
          lastSelectedMessageType: 'Default',
          customRollTemplate: template.formula
        });
      }
    } catch (error) {
      console.error('[Pixels Roll20] Error loading message types:', error);
    }
  }, []);

  // Update Custom Modifiers
  const loadCustomModifiers = useCallback(async () => {
    const result = await chrome.storage.local.get(['customModifiers']);
    if (result.customModifiers) {
      setCustomModifiers(result.customModifiers);
    }
  }, []);

  const toggleCustomModifier = async (id: string) => {
    const updated = customModifiers.map(m => m.id === id ? { ...m, active: !m.active } : m);
    setCustomModifiers(updated);
    await chrome.storage.local.set({ customModifiers: updated });
  };

  const customModifierSum = customModifiers
    .filter(m => m.active)
    .reduce((sum, m) => sum + m.value, 0);

  useEffect(() => {
    chrome.storage.local.set({
      modifierConfig: {
        advantageMode,
        modifierSource,
        modifierKey,
        manualModifier,
        customModifierSum
      }
    });
  }, [advantageMode, modifierSource, modifierKey, manualModifier, customModifierSum]);

  useEffect(() => {
    loadMessageTypes();
    updateDiceList();
    loadCustomModifiers();
    const interval = setInterval(updateDiceList, 1000);

    const messageListener = (message: any) => {
      if (message.type === 'diceRolled' || message.type === 'dieStatusChanged' || message.type === 'diceStatusUpdate') {
        updateDiceList();
      }
      if (message.type === 'waitingForSecondRoll') {
        setIsWaitingForSecondRoll(message.waiting);
      }
      if (message.type === 'rollError') {
        setRollError(message.error);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [loadMessageTypes, updateDiceList]);

  // Handle error dismissal
  useEffect(() => {
    if (rollError) {
      const timer = setTimeout(() => setRollError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [rollError]);

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    setSelectedTemplateKey(key);
    if (key && rollTemplates.has(key)) {
      const template = rollTemplates.get(key)!;
      chrome.storage.local.set({
        lastSelectedMessageType: key,
        customRollTemplate: template.formula
      });
    } else {
      chrome.storage.local.set({
        lastSelectedMessageType: '',
        customRollTemplate: ''
      });
    }
  };

  const handleOpenHub = async (tab: string = 'dice', params: string = '') => {
    try {
      const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('hub.html*') });

      if (tabs.length > 0 && tabs[0].id !== undefined) {
        // Focus existing tab
        await chrome.tabs.update(tabs[0].id, { active: true });
        // Request internal tab switch
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'switchTab',
          tab,
          action: params.includes('action=pair') ? 'pair' : undefined
        });
      } else {
        // Create new tab
        const url = chrome.runtime.getURL(`hub.html?tab=${tab}${params ? '&' + params : ''}`);
        const roll20Tabs = await chrome.tabs.query({ url: '*://app.roll20.net/*' });
        const activeRoll20 = roll20Tabs.find(t => t.active) || roll20Tabs[0];

        await chrome.tabs.create({
          url,
          pinned: false,
          active: true,
          index: activeRoll20 ? activeRoll20.index + 1 : undefined,
          windowId: activeRoll20 ? activeRoll20.windowId : undefined
        });
      }
    } catch (error) {
      console.error('[Pixels Roll20] Error opening hub:', error);
    }
  };

  const handleConnectDie = () => handleOpenHub('dice', 'action=pair');

  // Reconnecting happens in the Hub (it owns the Bluetooth connections); opening the
  // dice tab remounts/focuses it, which kicks off automatic reconnection of saved dice.
  const handleReconnectDie = () => handleOpenHub('dice');

  const handleDisconnect = async (dieId: string) => {
    try {
      await chrome.runtime.sendMessage({ type: 'disconnect', dieId });
      updateDiceList();
    } catch (error) {
      console.error('[Pixels Roll20] Error disconnecting die:', error);
    }
  };

  const templateOptions = Array.from(rollTemplates.entries()).map(([key, t]) => ({
    value: key,
    label: t.name
  }));

  return (
    <div className="w-[500px] p-4 text-text-main pb-6">
      <div className="flex items-center gap-3 mb-6">
        <Logo size={48} />
        <h2 className="text-2xl font-black tracking-tight text-accent italic flex-1">Pixels Dice for Roll20</h2>

        <Button
          onClick={() => handleOpenHub('settings')}
          variant="secondary"
          className="!p-0 w-10 h-10 rounded-xl"
          title="Open Pixels Hub"
        >
          <Settings size={22} />
        </Button>
      </div>

      {(() => {
        const connectedDice = diceList.filter(d => d.status !== 'disconnected');
        const disconnectedDice = diceList.filter(d => d.status === 'disconnected');
        return (
          <div className="bg-white/2 border border-white/5 rounded-2xl p-3 mb-6 shadow-none space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-visible">
                <span className="text-[0.8rem] font-black uppercase tracking-[0.2em] text-text-muted opacity-80 whitespace-nowrap">Connected:</span>
                <div className="flex gap-4 overflow-visible no-scrollbar py-1">
                  {connectedDice.length === 0 ? (
                    <span className="text-[0.8rem] font-black uppercase tracking-widest text-text-muted opacity-40">No dice connected.</span>
                  ) : (
                    connectedDice.map(die => <DieLabel key={die.dieId} die={die} />)
                  )}
                </div>
              </div>
              <Button
                onClick={handleConnectDie}
                className="w-8 h-8 !p-0 rounded-full flex-shrink-0 shadow-lg shadow-accent/20"
                title="Add Dice"
              >
                <Plus size={18} />
              </Button>
            </div>

            {disconnectedDice.length > 0 && (
              <button
                onClick={handleReconnectDie}
                title="Reconnect saved dice in the Hub"
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/2 hover:bg-accent/10 border border-transparent hover:border-accent/20 transition-colors group"
              >
                <RefreshCw size={13} className="text-accent group-hover:rotate-180 transition-transform duration-300 shrink-0" />
                <span className="text-[0.65rem] font-black uppercase tracking-widest text-accent shrink-0">Reconnect</span>
                <span className="flex gap-3 overflow-hidden opacity-60">
                  {disconnectedDice.map(die => <DieLabel key={die.dieId} die={die} />)}
                </span>
              </button>
            )}
          </div>
        );
      })()}

      {/* Modifiers Section */}
      <Card className="p-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs font-black uppercase tracking-widest text-text-muted opacity-60">Modifiers & Advantage</span>
          <button
            onClick={() => {
              setModifierSource('none');
              setModifierKey('');
              setManualModifier(0);
              setAdvantageMode('normal');
            }}
            className="text-[0.6rem] font-black uppercase tracking-tighter px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-main transition-colors flex items-center gap-1"
          >
            <Trash2 size={10} /> Clear
          </button>
        </div>

        {/* Advantage Toggles */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {['advantage', 'normal', 'disadvantage'].map((mode) => (
            <button
              key={mode}
              onClick={() => setAdvantageMode(mode as any)}
              className={`py-2 rounded-lg font-black uppercase text-[0.7rem] tracking-widest transition-all ${advantageMode === mode
                ? 'bg-accent text-white shadow-lg shadow-accent/20'
                : 'bg-white/5 text-text-muted hover:bg-white/10'
                }`}
            >
              {mode === 'normal' ? 'Normal' : mode === 'advantage' ? 'Adv' : 'Dis'}
            </button>
          ))}
        </div>

        {/* Source Selectors */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {[
            { id: 'stat', icon: <User size={14} />, label: 'Stats' },
            { id: 'save', icon: <Shield size={14} />, label: 'Saves' },
            { id: 'skill', icon: <Book size={14} />, label: 'Skills' }
          ].map(src => (
            <button
              key={src.id}
              onClick={() => setModifierSource(modifierSource === src.id ? 'none' : src.id as any)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[0.7rem] font-bold transition-all border whitespace-nowrap ${modifierSource === src.id
                ? 'bg-accent/10 border-accent text-accent'
                : 'bg-white/5 border-transparent text-text-muted hover:text-text-main'
                }`}
            >
              {src.icon}
              {src.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 bg-black/40 rounded-full px-3 py-1 border border-white/5">
            <span className="text-[0.6rem] font-bold text-text-muted uppercase">Bonus</span>
            <input
              type="number"
              value={manualModifier === 0 ? '' : manualModifier}
              onChange={(e) => setManualModifier(parseInt(e.target.value) || 0)}
              placeholder="+0"
              className="bg-transparent w-8 text-center text-[0.7rem] font-bold text-accent outline-none"
            />
          </div>
        </div>

        {/* Sub-selectors */}
        {modifierSource === 'stat' && (
          <div className="grid grid-cols-6 gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
            {STATS.map(s => (
              <button
                key={s}
                onClick={() => setModifierKey(modifierKey === s ? '' : s)}
                className={`py-2 rounded-lg font-black uppercase text-[0.6rem] transition-all ${modifierKey === s && modifierSource === 'stat'
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-text-muted hover:bg-white/10'
                  }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {modifierSource === 'save' && (
          <div className="grid grid-cols-6 gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
            {STATS.map(s => (
              <button
                key={s}
                onClick={() => setModifierKey(modifierKey === s ? '' : s)}
                className={`py-2 rounded-lg font-black uppercase text-[0.6rem] transition-all ${modifierKey === s && modifierSource === 'save'
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-text-muted hover:bg-white/10'
                  }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {modifierSource === 'skill' && (
          <div className="grid grid-cols-3 gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
            {SKILLS.map(s => (
              <button
                key={s}
                onClick={() => setModifierKey(modifierKey === s ? '' : s)}
                className={`py-1.5 px-1 rounded-lg font-bold uppercase text-[0.55rem] tracking-tighter truncate transition-all ${modifierKey === s && modifierSource === 'skill'
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-text-muted hover:bg-white/10 text-left pl-2'
                  }`}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}

        {/* Custom Modifiers Collapsible */}
        <div className="mt-4 border-t border-white/5 pt-4">
          <button
            onClick={() => setIsCustomModifiersOpen(!isCustomModifiersOpen)}
            className="w-full flex justify-between items-center group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className={`transition-transform duration-200 ${isCustomModifiersOpen ? 'rotate-180' : ''}`}>
                <ChevronDown size={14} className="text-text-muted group-hover:text-accent" />
              </span>
              <span className="text-[0.65rem] font-black uppercase tracking-widest text-text-muted group-hover:text-text-main">Custom Modifiers</span>
            </div>
            {customModifierSum !== 0 && (
              <span className="text-[0.7rem] font-black text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/10">
                {customModifierSum > 0 ? `+${customModifierSum}` : customModifierSum}
              </span>
            )}
          </button>

          {isCustomModifiersOpen && (
            <div className="mt-4 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              {customModifiers.length === 0 ? (
                <p className="text-[0.6rem] text-text-muted italic text-center py-2">
                  Add custom modifiers in the <button onClick={() => handleOpenHub('modifiers')} className="text-accent underline cursor-pointer hover:text-accent-hover transition-colors inline-bg-transparent border-0 p-0 font-italic">Hub settings</button>.
                </p>
              ) : (
                customModifiers.map(mod => (
                  <button
                    key={mod.id}
                    onClick={() => toggleCustomModifier(mod.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                      mod.active 
                        ? 'bg-accent/10 border-accent/20 text-text-main' 
                        : 'bg-white/2 border-transparent text-text-muted hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full border-2 transition-all ${
                        mod.active ? 'bg-accent border-accent scale-110' : 'border-white/10'
                      }`} />
                      <span className="text-[0.7rem] font-bold uppercase tracking-tight">{mod.name}</span>
                    </div>
                    <span className={`text-[0.75rem] font-black ${mod.active ? 'text-accent' : 'opacity-40'}`}>
                      {mod.value >= 0 ? `+${mod.value}` : mod.value}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {isWaitingForSecondRoll && (
          <div className="mt-4 p-3 bg-accent/10 border border-accent/20 rounded-xl flex items-center gap-3 animate-pulse">
            <RefreshCw size={16} className="text-accent animate-spin-slow" />
            <div className="text-[0.7rem] font-bold text-accent uppercase tracking-wider">
              Waiting for second die roll...
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="p-1">
          <span className="label-text block mb-2 font-bold uppercase tracking-wider text-xs text-text-muted">Roll Type</span>
          <Select
            options={templateOptions}
            value={selectedTemplateKey}
            onChange={handleTemplateChange}
            className="text-lg font-medium"
          />
        </div>
      </Card>
      <SupportButton />

      <Modal
        isOpen={!!rollError}
        onClose={() => setRollError(null)}
        title="Roll Failed"
        variant="warning"
        actions={
          <Button onClick={() => setRollError(null)}>Got it</Button>
        }
      >
        <p>{rollError}</p>
      </Modal>
    </div>
  );
};

export default Popup;
