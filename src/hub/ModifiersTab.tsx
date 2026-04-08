import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Logo } from '../components/UI';
import { GripVertical, Plus, Trash2, ShieldAlert, Sparkles, AlertCircle, Lightbulb } from 'lucide-react';

interface CustomModifier {
  id: string;
  name: string;
  value: number;
  active: boolean;
}

const ModifiersTab: React.FC = () => {
  const [modifiers, setModifiers] = useState<CustomModifier[]>([]);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState<string>('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editValue, setEditValue] = useState<string>('');

  // Load Modifiers
  useEffect(() => {
    chrome.storage.local.get(['customModifiers'], (result) => {
      if (result.customModifiers) {
        setModifiers(result.customModifiers);
      }
    });
  }, []);

  // Save Modifiers
  const saveModifiers = (newModifiers: CustomModifier[]) => {
    setModifiers(newModifiers);
    chrome.storage.local.set({ customModifiers: newModifiers });
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    const val = parseInt(newValue) || 0;
    const newMod: CustomModifier = {
      id: Math.random().toString(36).substr(2, 9),
      name: newName,
      value: val,
      active: false
    };
    saveModifiers([...modifiers, newMod]);
    setNewName('');
    setNewValue('');
  };

  const handleDelete = (id: string) => {
    saveModifiers(modifiers.filter(m => m.id !== id));
  };

  // Drag and Drop Handlers (Simple)
  const onDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newModifiers = [...modifiers];
    const item = newModifiers.splice(draggedIndex, 1)[0];
    newModifiers.splice(index, 0, item);

    setDraggedIndex(index);
    setModifiers(newModifiers);
  };

  const onDragEnd = () => {
    setDraggedIndex(null);
    saveModifiers(modifiers);
  };

  const startEditing = (mod: CustomModifier) => {
    setEditingId(mod.id);
    setEditName(mod.name);
    setEditValue(mod.value.toString());
  };

  const handleSaveEdit = (e?: React.FocusEvent) => {
    if (!editingId) return;
    
    // If we're blurring to another element inside the same edit container, don't save yet
    if (e?.relatedTarget && (e.relatedTarget as HTMLElement).closest('.edit-container')) {
      return;
    }

    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    const updated = modifiers.map(m => 
      m.id === editingId 
        ? { ...m, name: editName.trim(), value: parseInt(editValue) || 0 }
        : m
    );
    saveModifiers(updated);
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveEdit();
    if (e.key === 'Escape') setEditingId(null);
  };

  return (
    <div className="space-y-12 pb-24">
      <header>
        <h2 className="text-3xl font-black uppercase tracking-tight mb-2">Custom Modifiers</h2>
        <p className="text-text-muted opacity-60 max-w-2xl">Create persistent bonuses or penalties (e.g. Guidance, Bless, Cover) that you can toggle in the popup.</p>
      </header>

      {/* Add Form */}
      <section className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-text-muted/40 px-2">Add New Modifier</h3>
        <Card className="border-white/5 bg-surface/40 backdrop-blur-sm p-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-[0.65rem] font-black uppercase tracking-widest text-text-muted opacity-50 pl-1">Modifier Name</label>
              <Input
                placeholder="e.g. Bless, Sharpshooter..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="w-24 space-y-2">
              <label className="text-[0.65rem] font-black uppercase tracking-widest text-text-muted opacity-50 pl-1">Value</label>
              <Input
                type="number"
                placeholder="+0"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="text-center font-bold text-accent"
              />
            </div>
            <Button
              onClick={handleAdd}
              className="bg-accent hover:bg-accent-hover text-white h-[46px] w-[46px] flex items-center justify-center p-0"
            >
              <Plus size={24} />
            </Button>
          </div>
        </Card>
      </section>

      {/* List */}
      <section className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-text-muted/40">Custom Modifiers</h3>
        </div>

        {modifiers.length === 0 ? (
          <div className="py-12 border-2 border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center text-center opacity-30">
            <Sparkles size={40} className="mb-4 text-text-muted" />
            <p className="font-bold text-lg">No custom modifiers yet.</p>
            <p className="text-sm">Create some above to see them in the popup!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {modifiers.map((mod, index) => (
              <div
                key={mod.id}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-4 p-4 rounded-xl border border-white/5 group transition-all duration-200 ${draggedIndex === index
                    ? 'opacity-40 bg-accent/10 border-accent/20 scale-95'
                    : 'bg-surface/60 hover:bg-surface hover:border-white/10'
                  }`}
              >
                <div className="cursor-grab active:cursor-grabbing p-1 text-text-muted hover:text-text-main group-hover:bg-white/5 rounded-lg transition-colors">
                  <GripVertical size={20} />
                </div>

                {editingId === mod.id ? (
                  <div className="flex-1 flex items-center gap-3 edit-container">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={handleKeyDown}
                      autoFocus
                      className="flex-1"
                    />
                    <div className="w-24">
                      <Input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleSaveEdit}
                        onKeyDown={handleKeyDown}
                        className="text-center font-bold text-accent"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 cursor-text" onClick={() => startEditing(mod)}>
                      <h4 className="font-bold text-lg leading-none">{mod.name}</h4>
                    </div>

                    <div 
                      className="text-lg font-black text-accent bg-accent/10 px-4 py-1.5 rounded-lg border border-accent/10 min-w-[3rem] text-center cursor-text hover:bg-accent/20 transition-colors"
                      onClick={() => startEditing(mod)}
                    >
                      {mod.value >= 0 ? `+${mod.value}` : mod.value}
                    </div>
                  </>
                )}

                <button
                  onClick={() => handleDelete(mod.id)}
                  className="p-2 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center px-2">
          <span className="text-[0.6rem] font-bold text-text-muted bg-white/5 px-2 py-0.5 rounded uppercase">Reorderable</span>
        </div>
      </section>

      {/* Help Section */}
      <Card className="bg-yellow-400/5 border-yellow-400/10 p-6 flex gap-4 mt-12">
        <div className="p-3 bg-yellow-400/10 rounded-xl text-yellow-400 h-fit">
          <Lightbulb size={24} />
        </div>
        <div>
          <h4 className="font-bold text-yellow-400 mb-1 leading-none uppercase tracking-tight">Tip</h4>
          <p className="text-sm text-text-muted leading-relaxed">
            You can use negative values for persistent penalties like "Bane" or "Heavy Armor Stealth".
          </p>
        </div>
      </Card>
    </div>
  );
};

export default ModifiersTab;
