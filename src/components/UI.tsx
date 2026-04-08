import React, { ReactNode, useEffect } from 'react';
import { X, Battery, BatteryCharging, SignalHigh, SignalMedium, SignalLow, Settings, Plus, Trash2, Copy, Download, AlertTriangle, CheckCircle, Info } from 'lucide-react';


// Common UI Components for Pixels Roll20

export const Card: React.FC<{ children: ReactNode, className?: string }> = ({ children, className = "" }) => (
  <div className={`bg-surface border border-border-main rounded-xl p-4 mb-4 shadow-main ${className}`}>
    {children}
  </div>
);

export const Button: React.FC<{ 
  children: ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'danger', 
  className?: string,
  disabled?: boolean,
  id?: string,
  title?: string
}> = ({ children, onClick, variant = 'primary', className = "", disabled = false, id, title }) => {
  const baseClasses = "font-semibold px-4 py-2 rounded-lg cursor-pointer transition-all duration-200 inline-flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-accent text-white hover:bg-accent-hover hover:-translate-y-px",
    secondary: "bg-card-bg text-text-main border border-border-main hover:bg-surface-hover",
    danger: "bg-danger text-white hover:bg-red-600"
  };
  
  return (
    <button 
      id={id}
      onClick={onClick} 
      disabled={disabled}
      title={title}
      className={`${baseClasses} ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

export const Input: React.FC<{
  id?: string,
  type?: string,
  value?: string,
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void,
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void,
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void,
  placeholder?: string,
  className?: string,
  maxLength?: number,
  autoFocus?: boolean
}> = ({ id, type = "text", value, onChange, onBlur, onKeyDown, placeholder, className = "", maxLength, autoFocus }) => (
  <input
    id={id}
    type={type}
    value={value}
    onChange={onChange}
    onBlur={onBlur}
    onKeyDown={onKeyDown}
    placeholder={placeholder}
    maxLength={maxLength}
    autoFocus={autoFocus}
    className={`w-full bg-card-bg border border-border-main rounded-lg text-text-main px-3 py-2.5 font-sans text-[0.95rem] transition-colors focus:outline-none focus:border-accent ${className}`}
  />
);

export const Select: React.FC<{
  id?: string,
  value?: string,
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void,
  options: { value: string, label: string }[],
  className?: string
}> = ({ id, value, onChange, options, className = "" }) => (
  <select
    id={id}
    value={value}
    onChange={onChange}
    className={`w-full bg-card-bg border border-border-main rounded-lg text-text-main px-3 py-2.5 font-sans text-[0.95rem] transition-colors focus:outline-none focus:border-accent appearance-none ${className}`}
  >
    {options.map(opt => (
      <option key={opt.value} value={opt.value} className="bg-surface text-text-main">
        {opt.label}
      </option>
    ))}
  </select>
);

export const TextArea: React.FC<{
  id?: string,
  value?: string,
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void,
  placeholder?: string,
  className?: string
}> = ({ id, value, onChange, placeholder, className = "" }) => (
  <textarea
    id={id}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={`w-full bg-card-bg border border-border-main rounded-lg text-text-main px-3 py-2.5 font-sans text-[0.95rem] transition-colors focus:outline-none focus:border-accent resize-none ${className}`}
  />
);

export const BatteryIcon: React.FC<{ level: number, isCharging?: boolean }> = ({ level, isCharging }) => {
  let batteryClass = 'bg-success';
  if (level <= 20) batteryClass = 'bg-danger';
  else if (level <= 50) batteryClass = 'bg-warning';
  
  if (isCharging) batteryClass = 'bg-[#00bcd4]';

  return (
    <div className="flex items-center gap-2 text-[0.8rem] text-text-muted">
      <span>{Math.round(level)}%</span>
      <div className="w-7 h-3.5 border-1.5 border-border-main rounded-[2px] relative p-[1px]">
        <div 
          className={`h-full rounded-[1px] transition-all duration-300 ${batteryClass}`} 
          style={{ width: `${level}%` }}
        ></div>
        <div className="absolute -right-1 top-[3px] w-[3px] h-[6px] bg-border-main rounded-r-[1px]"></div>
      </div>
    </div>
  );
};

export const Logo: React.FC<{ size: number, className?: string, alt?: string }> = ({ size, className = "", alt = "Pixels Logo" }) => {
  let logoFile = 'pixels_logo_1080.png';
  
  if (size <= 64) {
    logoFile = 'pixels_logo_64.png';
  } else if (size <= 128) {
    logoFile = 'pixels_logo_128.png';
  } else if (size <= 256) {
    logoFile = 'pixels_logo_256.png';
  }

  const logoUrl = chrome.runtime.getURL(`images/${logoFile}`);

  return (
    <img 
      src={logoUrl} 
      alt={alt} 
      width={size} 
      height={size} 
      className={className} 
      style={{ objectFit: 'contain' }}
    />
  );
};

export const DieIcon: React.FC<{ 
  type: string, 
  size?: number, 
  className?: string,
  isRolling?: boolean,
  result?: number | null
}> = ({ type, size = 40, className = "", isRolling = false, result = null }) => {
  const normalizedType = type.toLowerCase().replace('pipped', '');
  
  const getShape = () => {
    switch (normalizedType) {
      case 'd20': return <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" />;
      case 'd12': return <polygon points="12,2 22,9 18,21 6,21 2,9" />;
      case 'd10': return <polygon points="12,2 20,8 12,22 4,8" />;
      case 'd8': return <polygon points="12,2 22,12 12,22 2,12" />;
      case 'd6': return <rect x="4" y="4" width="16" height="16" rx="2" />;
      case 'd4': return <polygon points="12,2 2,22 22,22" />;
      case 'fudge': return <path d="M5 12h14M12 5v14" strokeWidth="3" />;
      default: return <circle cx="12" cy="12" r="10" />;
    }
  };

  const showResult = result !== null && result !== undefined && !isRolling;
  
  const typeStr = normalizedType.replace('d', '');
  const dSize = parseInt(typeStr) || 20;
  const maxVal = typeStr === '00' ? 90 : dSize;
  const isCrit = result === maxVal;
  const isFail = result === 1;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg 
        width="100%" 
        height="100%" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={`${isRolling ? 'animate-rolling-all' : 'die-settle'} transition-colors duration-500`}
      >
        {getShape()}
      </svg>
      {showResult && (
        <div 
          className={`absolute inset-0 flex items-center justify-center font-black result-text pointer-events-none ${isCrit ? 'animate-crit-all' : 'animate-result-fade'}`}
          style={{ 
            fontSize: size * 0.4,
            color: isCrit ? undefined : isFail ? '#ec1b37' : 'white'
          }}
        >
          {result === -1 ? '-' : result === 1 && normalizedType === 'fudge' ? '+' : result === 0 && normalizedType === 'fudge' ? ' ' : result}
        </div>
      )}
    </div>
  );
};

export const PhysicalDie: React.FC<{ 
  die: { dieType: string, isRolling: boolean, lastResult?: number | null },
  size?: number,
  className?: string
}> = ({ die, size = 48, className = "" }) => (
  <DieIcon 
    type={die.dieType}
    size={size}
    className={className}
    isRolling={die.isRolling}
    result={die.isRolling ? null : die.lastResult}
  />
);

export const DieRow: React.FC<{
  die: any,
  onDisconnect?: (id: string) => void,
  showSignal?: boolean,
  className?: string
}> = ({ die, onDisconnect, showSignal = false, className = "" }) => {
  const colorwayLabel = die.colorway 
    ? die.colorway
        .replace(/([A-Z])/g, ' $1') // insert space before capital letters
        .split(/[_\-\ ]/)
        .filter(Boolean)
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ') 
    : '';

  const typeStr = (die.dieType || 'd20').toLowerCase().replace('pipped', '').replace('d', '');
  const dSize = parseInt(typeStr) || 20;
  const maxVal = typeStr === '00' ? 90 : dSize;
  const isCrit = die.lastResult === maxVal;
  const isFail = die.lastResult === 1;

  return (
    <div className={`relative bg-card-bg p-4 rounded-xl flex justify-between items-center border border-border-main hover:border-accent transition-all group ${className}`}>
      <div className="flex items-center gap-4">
        <PhysicalDie die={die} size={48} className="group-hover:scale-110 transition-transform" />
        <div className="text-left">
          <div className="font-bold text-lg leading-tight flex items-center gap-2">
            <span className="text-text-muted text-sm uppercase">{die.dieType ? die.dieType.toUpperCase().replace('PIPPED', '') : 'D20'}</span>
            <span>{die.name || 'Pixels Die'}</span>
          </div>
          {colorwayLabel && <div className="text-[0.7rem] font-bold text-accent uppercase tracking-widest mt-0.5 opacity-60">{colorwayLabel}</div>}
          <div className="text-xs mt-2">
            <span className={`uppercase font-black px-1.5 py-0.5 rounded ${
              die.status === 'disconnected' ? 'bg-danger/10 text-danger' : 
              die.isRolling ? 'bg-white/10 animate-rainbow' : 
              die.lastResult ? (isCrit ? 'bg-white/10 animate-rainbow animate-result-fade' : isFail ? 'bg-red-500/20 text-[#ec1b37] animate-result-fade' : 'bg-white/10 text-white animate-result-fade') : 
              die.status === 'crooked' ? 'bg-warning/10 text-warning' : 'bg-text-muted/10 text-text-muted opacity-60'
            }`}>
              {die.status === 'disconnected' ? 'Disconnected' : 
               die.isRolling ? 'Rolling' : 
               die.lastResult ? `Rolled ${die.lastResult}` : 
               die.status === 'crooked' ? 'Tilted' : 'Ready'}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col items-end justify-between self-stretch min-h-[56px]">
        {onDisconnect && (
          <button 
            onClick={() => onDisconnect(die.dieId)}
            className="text-text-muted hover:text-danger hover:scale-110 transition-all opacity-30 group-hover:opacity-100 p-1 -mr-1 -mt-1"
            title="Disconnect Die"
          >
            <X size={18} strokeWidth={3} />
          </button>
        )}
        <div className="flex items-center gap-3 mt-auto">
          <BatteryIcon level={die.battery} isCharging={die.isCharging} />
          {showSignal && <SignalIcon rssi={die.rssi} />}
        </div>
      </div>
    </div>
  );
};

export const SignalIcon: React.FC<{ rssi?: number, size?: number }> = ({ rssi, size = 16 }) => {
  if (rssi === undefined) return null;
  
  let color = 'bg-success';
  let bars = 4;
  
  if (rssi < -85) {
    color = 'bg-danger';
    bars = 1;
  } else if (rssi < -75) {
    color = 'bg-warning';
    bars = 2;
  } else if (rssi < -65) {
    bars = 3;
  }
  
  return (
    <div className="flex items-end gap-[2px]" style={{ height: size, width: size }}>
      {[1, 2, 3, 4].map(b => (
        <div 
          key={b} 
          className={`w-[3px] rounded-t-[1px] transition-all ${b <= bars ? color : 'bg-border-main'}`} 
          style={{ height: `${(b / 4) * 100}%` }}
        />
      ))}
    </div>
  );
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  variant?: 'info' | 'warning' | 'danger' | 'success';
  actions?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  variant = 'info',
  actions 
}) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const variantIcons = {
    info: <Info className="text-accent" />,
    warning: <AlertTriangle className="text-warning" />,
    danger: <Trash2 className="text-danger" />,
    success: <CheckCircle className="text-success" />
  };

  const variantColors = {
    info: 'border-accent/30',
    warning: 'border-warning/30',
    danger: 'border-danger/30',
    success: 'border-success/30'
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`bg-surface border-2 ${variantColors[variant]} rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            {variantIcons[variant]}
            <h3 className="text-xl font-black uppercase tracking-tight">{title}</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors text-text-muted hover:text-text-main"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 text-text-muted leading-relaxed">
          {children}
        </div>
        
        {actions && (
          <div className="flex flex-row-reverse gap-3 p-4 bg-white/5 border-t border-white/5">
            {actions}
          </div>
        )}
      </div>
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
};

export const SupportButton: React.FC = () => (
  <div className="flex flex-col items-center gap-3 py-6 border-t border-white/5 mt-12 w-full text-center opacity-60 hover:opacity-100 transition-opacity">
    <p className="text-[0.6rem] uppercase tracking-[0.2em] font-black text-text-muted">Support the developer</p>
    <form action="https://www.paypal.com/donate" method="post" target="_blank">
      <input type="hidden" name="business" value="VSZVE7SKUWFUU" />
      <input type="hidden" name="no_recurring" value="0" />
      <input type="hidden" name="item_name" value="As an unemployed product manager that loves tinkering on and contributing to projects, I very much appreciate your support!" />
      <input type="hidden" name="currency_code" value="USD" />
      <input type="image" src="https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif" name="submit" title="PayPal - The safer, easier way to pay online!" alt="Donate with PayPal button" className="hover:scale-105 transition-transform" />
    </form>
  </div>
);

