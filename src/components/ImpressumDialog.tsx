import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import ObfuscatedText from './ObfuscatedText';
import { legalConfig } from './legalConfig';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ImpressumDialog({ open, onOpenChange }: Props) {
  const labelStyle: React.CSSProperties = { color: '#aaa', fontSize: 10 };
  const valueStyle: React.CSSProperties = { color: '#eee', fontSize: 11 };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ background: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0, zIndex: 1000 }} />
        <Dialog.Content style={{ background: '#222', color: '#fff', borderRadius: 8, padding: 16, position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1001, width: 420, maxWidth: '90vw' }}>
          <Dialog.Title style={{ marginBottom: 8 }}>Impressum</Dialog.Title>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 6 }}>
            <div style={labelStyle}>Name</div>
            <div style={valueStyle}><ObfuscatedText value={legalConfig.companyName} /></div>

            <div style={labelStyle}>Adresse</div>
            <div style={valueStyle}>
              <div><ObfuscatedText value={legalConfig.street} /></div>
              <div><ObfuscatedText value={legalConfig.zipCity} /></div>
              <div><ObfuscatedText value={legalConfig.country} /></div>
            </div>

            <div style={labelStyle}>E-Mail</div>
            <div style={valueStyle}><ObfuscatedText value={legalConfig.email} /></div>

            {legalConfig.phone && (<>
              <div style={labelStyle}>Telefon</div>
              <div style={valueStyle}><ObfuscatedText value={legalConfig.phone} /></div>
            </>)}

            {legalConfig.registerNumber && (<>
              <div style={labelStyle}>Register</div>
              <div style={valueStyle}>
                <div><ObfuscatedText value={legalConfig.registerCourt || ''} /></div>
                <div><ObfuscatedText value={legalConfig.registerNumber} /></div>
              </div>
            </>)}

            {legalConfig.vatId && (<>
              <div style={labelStyle}>USt-IdNr.</div>
              <div style={valueStyle}><ObfuscatedText value={legalConfig.vatId} /></div>
            </>)}
          </div>

          <div style={{ textAlign: 'right', marginTop: 12 }}>
            <Dialog.Close asChild>
              <button style={{ padding: '6px 12px', background: '#444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Schließen</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
