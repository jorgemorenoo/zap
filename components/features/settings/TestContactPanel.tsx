'use client';

import React, { useState } from 'react';
import { UserCheck, X, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { formatPhoneNumberDisplay } from '../../../lib/phone-formatter';

export interface TestContactPanelProps {
  testContact?: { name?: string; phone: string } | null;
  saveTestContact?: (contact: { name?: string; phone: string }) => Promise<void>;
  removeTestContact?: () => Promise<void>;
  isSaving?: boolean;
}

export function TestContactPanel({
  testContact,
  saveTestContact,
  removeTestContact,
  isSaving,
}: TestContactPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(testContact?.name || '');
  const [phone, setPhone] = useState(testContact?.phone || '');

  const handleSave = async () => {
    if (!phone.trim()) {
      toast.error('Preencha o telefone do contato de teste');
      return;
    }

    if (!saveTestContact) {
      toast.error('Função de salvar não disponível');
      return;
    }

    try {
      await saveTestContact({
        name: name.trim(),
        phone: phone.trim(),
      });
      setIsEditing(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleRemove = async () => {
    if (!removeTestContact) return;

    try {
      await removeTestContact();
      setName('');
      setPhone('');
    } catch {
      // Error handled by mutation
    }
  };

  const handleEdit = () => {
    setName(testContact?.name || '');
    setPhone(testContact?.phone || '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setName(testContact?.name || '');
    setPhone(testContact?.phone || '');
  };

  return (
    <div className="glass-panel rounded-2xl p-8">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-amber-500 rounded-full"></span>
        Contato de Teste
      </h3>
      <p className="text-sm text-gray-400 mb-6">
        Configure um número para testar suas campanhas antes de enviar para todos os contatos.
      </p>

      {testContact && !isEditing ? (
        // Show saved test contact
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-xl">
              <UserCheck size={24} className="text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-white">{testContact.name || 'Contato de Teste'}</p>
              <p className="text-sm text-amber-400 font-mono">
                {formatPhoneNumberDisplay(testContact.phone, 'international')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleEdit}
              className="h-10 px-4 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              Editar
            </button>
            <button
              onClick={handleRemove}
              className="h-10 w-10 flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        // Form to add/edit test contact
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Nome
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Meu Teste"
                className="w-full px-4 py-3 bg-zinc-900/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none text-sm text-white transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Telefone (com código do país)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex: +5511999999999"
                className="w-full px-4 py-3 bg-zinc-900/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none text-sm text-white font-mono transition-all"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            {isEditing && (
              <button
                onClick={handleCancel}
                className="h-10 px-4 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="h-10 px-4 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Smartphone size={16} />
              Salvar Contato de Teste
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
