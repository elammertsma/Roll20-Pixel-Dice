import React, { useState, useEffect } from 'react';
import { Card, Button, Modal, Logo } from '../components/UI';
import { Monitor, Sparkles, HelpCircle, Bug } from 'lucide-react';

const SettingsTab: React.FC = () => {
  const [settings, setSettings] = useState({
    autoOpenPopup: true,
    autoOpenHub: true,
    showSignalIcons: true,
    hapticFeedback: false,
    digitalAdvantage: false
  });
  const [modal, setModal] = useState({ isOpen: false, title: '', content: '' });

  useEffect(() => {
    chrome.storage.local.get(['hubSettings'], (result) => {
      if (result.hubSettings) {
        setSettings(prev => ({ ...prev, ...result.hubSettings }));
      }
    });
  }, []);

  const updateSetting = async (key: keyof typeof settings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await chrome.storage.local.set({ hubSettings: newSettings });
  };

  const SettingRow: React.FC<{ 
    title: string, 
    description: string, 
    icon: React.ReactNode,
    children: React.ReactNode 
  }> = ({ title, description, icon, children }) => (
    <div className="flex items-center justify-between py-6 border-b border-white/5 last:border-0 hover:bg-white/2 px-4 -mx-4 rounded-2xl transition-all group">
      <div className="flex gap-4 items-start">
        <div className="p-2.5 rounded-xl bg-accent/10 text-accent group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div>
          <h4 className="font-bold text-lg mb-1">{title}</h4>
          <p className="text-sm text-text-muted opacity-60 leading-relaxed max-w-md">{description}</p>
        </div>
      </div>
      <div>
        {children}
      </div>
    </div>
  );

  const Toggle: React.FC<{ 
    enabled: boolean, 
    onChange: (enabled: boolean) => void 
  }> = ({ enabled, onChange }) => (
    <button 
      onClick={() => onChange(!enabled)}
      className={`w-12 h-6 rounded-full relative transition-all duration-300 ${
        enabled ? 'bg-accent shadow-lg shadow-accent/20' : 'bg-white/10'
      }`}
    >
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
        enabled ? 'left-7' : 'left-1'
      }`} />
    </button>
  );

  return (
    <div className="space-y-12 pb-24">
      <header>
        <h2 className="text-3xl font-black uppercase tracking-tight mb-2">Global Settings</h2>
        <p className="text-text-muted opacity-60">Configure how the Pixels Hub interacts with your browser and Roll20.</p>
      </header>

      <section className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-text-muted/40 px-2">Browser Interaction</h3>
        <Card className="border-white/5 bg-surface/40 backdrop-blur-sm">
          <SettingRow 
            title="Auto-open Popup" 
            description="Automatically open the Roll Type selection popup whenever you switch back to a Roll20 tab." 
            icon={<Monitor size={20} />}
          >
            <Toggle enabled={settings.autoOpenPopup} onChange={(v) => updateSetting('autoOpenPopup', v)} />
          </SettingRow>

          <SettingRow 
            title="Auto-open Hub with Popup" 
            description="Automatically open the Pixels Hub in a background tab when the Roll20 popup appears. This ensures your dice can reconnect silently as soon as you enter a game." 
            icon={<Sparkles size={20} />}
          >
            <Toggle enabled={settings.autoOpenHub} onChange={(v) => updateSetting('autoOpenHub', v)} />
          </SettingRow>

          <SettingRow 
            title="Digital Advantage (Single-Die)" 
            description="If enabled, rolling one physical die in Advantage/Disadvantage mode will automatically generate a second digital roll in Roll20." 
            icon={<Logo size={20} />}
          >
            <Toggle enabled={settings.digitalAdvantage} onChange={(v) => updateSetting('digitalAdvantage', v)} />
          </SettingRow>

          <SettingRow 
            title="Bluetooth Reconnection Flag" 
            description="Hide or show the experimental Bluetooth automatic reconnection permission guidance on the Dice tab. (This is always hidden when the Chrome flag is enabled.)" 
            icon={<Sparkles size={20} />}
          >
            <Toggle enabled={settings.showSignalIcons} onChange={(v) => updateSetting('showSignalIcons', v)} />
          </SettingRow>
        </Card>
      </section>


      {/*<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12">
        <Card className="p-6 bg-white/2 border-white/5 flex gap-4 items-center group cursor-pointer hover:border-accent/30 transition-all">
          <HelpCircle className="text-accent group-hover:scale-110 transition-transform" size={32} />
          <div>
            <h4 className="font-bold">Help & Documentation</h4>
            <p className="text-[0.7rem] text-text-muted">Learn how to setup advanced roll templates.</p>
          </div>
        </Card>

        <Card className="p-6 bg-white/2 border-white/5 flex gap-4 items-center group cursor-pointer hover:border-accent/30 transition-all">
          <Bug className="text-accent group-hover:scale-110 transition-transform" size={32} />
          <div>
            <h4 className="font-bold">Support & Feedback</h4>
            <p className="text-[0.7rem] text-text-muted">Report issues or suggest features on GitHub.</p>
          </div>
        </Card>
      </div>*/}

      <div className="text-center pt-12">
        <p className="text-[0.7rem] text-text-muted opacity-30 font-bold uppercase tracking-widest">Pixels Dice for Roll20 • v3.4.0</p>
      </div>

      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        actions={<Button onClick={() => setModal({ ...modal, isOpen: false })}>Understood</Button>}
      >
        <p className="text-sm opacity-80 leading-relaxed">{modal.content}</p>
      </Modal>
    </div>
  );
};

export default SettingsTab;
