import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import ObfuscatedText from './ObfuscatedText';
import { legalConfig } from './legalConfig';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function DatenschutzDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ background: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0, zIndex: 1000 }} />
        <Dialog.Content style={{ background: '#222', color: '#fff', borderRadius: 8, padding: 16, position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1001, width: 560, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }}>
          <Dialog.Title style={{ marginBottom: 8 }}>Datenschutzrichtlinie</Dialog.Title>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: '#ddd' }}>
            <p>Wir nehmen den Schutz Ihrer personenbezogenen Daten sehr ernst. Diese Richtlinie erklärt, welche Daten wir erheben, wie wir sie verwenden und welche Rechte Sie haben.</p>
            <h4>1. Verantwortlicher</h4>
            <p>
              <ObfuscatedText value={legalConfig.companyName} />
              <br />
              <ObfuscatedText value={legalConfig.street} />
              <br />
              <ObfuscatedText value={legalConfig.zipCity} />
              <br />
              <ObfuscatedText value={legalConfig.country} />
              <br />
              E-Mail: <ObfuscatedText value={legalConfig.email} />
            </p>

            <h4>2. Erhobene Daten</h4>
            <p>Bei Nutzung dieser Anwendung können technische Daten (z. B. IP-Adresse, Browsertyp) sowie Nutzungsdaten (z. B. Interaktionen innerhalb der App) erfasst werden. Falls Sie sich anmelden, werden außerdem Kontodaten verarbeitet, die Sie angeben.</p>

            <h4>3. Zweck der Verarbeitung</h4>
            <p>Die Datenverarbeitung erfolgt zur Bereitstellung der Funktionen der Anwendung, zur Stabilität und Sicherheit (z. B. Fehleranalyse) sowie – sofern Sie einwilligen – zur Speicherung Ihrer Inhalte und Einstellungen.</p>

            <h4>4. Rechtsgrundlagen</h4>
            <p>Je nach Fall stützen wir die Verarbeitung auf Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung), lit. f (berechtigtes Interesse an einer sicheren und funktionalen App) oder lit. a (Einwilligung).</p>

            <h4>5. Speicherdauer</h4>
            <p>Wir speichern personenbezogene Daten nur so lange, wie es für die genannten Zwecke erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen.</p>

            <h4>6. Ihre Rechte</h4>
            <p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch. Wenden Sie sich hierzu bitte an: <ObfuscatedText value={legalConfig.email} />.</p>

            <h4>7. Sicherheit</h4>
            <p>Wir treffen angemessene technische und organisatorische Maßnahmen, um Ihre Daten vor Verlust, Missbrauch und unbefugtem Zugriff zu schützen.</p>

            <h4>8. Kontakt</h4>
            <p>Fragen zum Datenschutz richten Sie bitte an: <ObfuscatedText value={legalConfig.email} />.</p>
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
