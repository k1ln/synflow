import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Github } from 'lucide-react';
import {
  PUBLISH_LIMITS, PublishError, buildSubmissionFlow, clearSession, describeFlow, fetchQuota,
  isPublishConfigured, loadSession, parseTags, publishFlow, signIn,
} from '../host';
import type { FlowGraph, PublishQuota, PublishResult, PublishSession } from '../host';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowName: string;
  /** Snapshot of the flow being edited, read when the dialog opens / on submit. */
  getFlow: () => FlowGraph;
};

const box: React.CSSProperties = { background: '#222', color: '#fff', borderRadius: 8, padding: 18, position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1001, width: 480, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', fontSize: 13 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#111', color: '#eee', border: '1px solid #3a3a3a', borderRadius: 4, padding: '6px 8px', font: 'inherit' };
const label: React.CSSProperties = { display: 'block', color: '#aaa', fontSize: 11, margin: '10px 0 4px' };
const btn = (primary = false, disabled = false): React.CSSProperties => ({ padding: '7px 14px', border: 'none', borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, background: primary ? '#2ea043' : '#444', color: '#fff', font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 });
const note: React.CSSProperties = { color: '#9aa3b8', fontSize: 12, lineHeight: 1.5, margin: '8px 0' };

const until = (t: number | null) => {
  if (!t) return '';
  const m = Math.max(1, Math.ceil((t - Date.now()) / 60000));
  return m >= 90 ? `${Math.round(m / 60)} h` : `${m} min`;
};

export default function PublishDialog({ open, onOpenChange, flowName, getFlow }: Props) {
  const [session, setSession] = useState<PublishSession | null>(null);
  const [quota, setQuota] = useState<PublishQuota | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PublishResult | null>(null);
  const graph = useRef<FlowGraph>({ nodes: [], edges: [] });
  const [facts, setFacts] = useState(() => describeFlow(graph.current));

  const refreshQuota = useCallback(async (s: PublishSession) => {
    try { setQuota(await fetchQuota(s)); }
    catch (e) {
      if (e instanceof PublishError && e.status === 401) { setSession(null); setQuota(null); }
      else setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Fresh state every time the dialog opens — and only then, so a parent re-render can't wipe the form.
  const latest = useRef({ getFlow, flowName });
  latest.current = { getFlow, flowName };
  useEffect(() => {
    if (!open) return;
    graph.current = latest.current.getFlow();
    setFacts(describeFlow(graph.current));
    setName(latest.current.flowName);
    setError(''); setResult(null); setAgreed(false); setQuota(null);
    const s = loadSession();
    setSession(s);
    if (s) void refreshQuota(s);
  }, [open, refreshQuota]);

  const onSignIn = () => {
    setError('');
    signIn()   // called synchronously from the click, or the popup gets blocked
      .then((s) => { setSession(s); return refreshQuota(s); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  const onSignOut = () => { clearSession(); setSession(null); setQuota(null); };

  const tagList = useMemo(() => parseTags(tags), [tags]);
  const problem =
    name.trim().length < 2 ? 'Give the flow a name.'
      : description.trim().length < PUBLISH_LIMITS.descriptionMin ? 'Describe what the flow does (a sentence is enough).'
        : tagList.length > PUBLISH_LIMITS.maxTags ? `Use at most ${PUBLISH_LIMITS.maxTags} tags.`
          : !agreed ? 'Confirm the license to publish.' : '';
  const blocked = quota
    ? quota.eligibleAt ? `Your GitHub account is too new to publish — try again in ${until(quota.eligibleAt)}.`
      : quota.remaining <= 0 ? `Daily limit reached (${quota.limit} per 24 h). Next slot in ${until(quota.resetsAt)}.`
        : quota.cooldownEndsAt ? `Please wait ${until(quota.cooldownEndsAt)} before publishing again.` : ''
    : '';

  const onPublish = async () => {
    if (!session || problem || blocked) return;
    setBusy(true); setError('');
    try {
      const flow = await buildSubmissionFlow(getFlow());
      setResult(await publishFlow(session, { name: name.trim(), description: description.trim(), tags: tagList }, flow));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (e instanceof PublishError && e.status === 401) { setSession(null); setQuota(null); }
      else if (session) void refreshQuota(session);
    } finally { setBusy(false); }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ background: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0, zIndex: 1000 }} />
        <Dialog.Content style={box} aria-describedby={undefined}>
          <Dialog.Title style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}><Github size={18} /> Publish to the gallery</Dialog.Title>

          {!isPublishConfigured() ? (
            <p style={note}>Publishing isn&apos;t set up in this build. Set <code>VITE_SYNFLOW_PUBLISH_URL</code> to the publish service
              (see <code>publish-proxy/README.md</code>) and rebuild.</p>
          ) : result ? (
            <>
              <p style={{ margin: '12px 0' }}>✅ {result.message}</p>
              <p style={note}>A maintainer will look at it. Once approved it appears in the
                {' '}<a href="https://k1ln.github.io/synflow/gallery/" target="_blank" rel="noopener noreferrer" style={{ color: '#4da8ff' }}>public gallery</a>.
                Follow the review on <a href={result.url} target="_blank" rel="noopener noreferrer" style={{ color: '#4da8ff' }}>GitHub issue #{result.number}</a>.
                You have {result.remaining} of {result.limit} publishes left today.</p>
            </>
          ) : !session ? (
            <>
              <p style={note}>Your flow is sent as a GitHub issue on <b>k1ln/synflow</b> and goes live in the gallery once a maintainer approves it.
                Sign in with GitHub so the gallery knows who published it. Synflow only reads your public profile and keeps no GitHub access afterwards.</p>
              <button style={btn(true)} onClick={onSignIn}><Github size={14} /> Sign in with GitHub</button>
            </>
          ) : (
            <>
              <p style={{ ...note, marginTop: 4 }}>
                Signed in as <b>@{session.login}</b>
                {quota && <> · <b>{quota.remaining}</b> of {quota.limit} publishes left today</>}
                {' · '}<a href="#signout" onClick={(e) => { e.preventDefault(); onSignOut(); }} style={{ color: '#9aa3b8' }}>sign out</a>
              </p>

              <label style={label} htmlFor="pub-name">Name</label>
              <input id="pub-name" style={input} value={name} maxLength={PUBLISH_LIMITS.name} onChange={(e) => setName(e.target.value)} />

              <label style={label} htmlFor="pub-desc">Description <span style={{ float: 'right' }}>{description.length}/{PUBLISH_LIMITS.descriptionMax}</span></label>
              <textarea id="pub-desc" style={{ ...input, minHeight: 72, resize: 'vertical' }} value={description} maxLength={PUBLISH_LIMITS.descriptionMax}
                placeholder="What does it sound like? How do you play it?" onChange={(e) => setDescription(e.target.value)} />

              <label style={label} htmlFor="pub-tags">Tags (comma separated, up to {PUBLISH_LIMITS.maxTags})</label>
              <input id="pub-tags" style={input} value={tags} placeholder="synth, bass, midi" onChange={(e) => setTags(e.target.value)} />

              <p style={note}>
                {facts.nodes} nodes, {facts.edges} connections. Published as <b>@{session.login}</b>.
                {facts.runsCode && <><br />⚠️ This flow contains script / worklet / HTML content. It is flagged for the reviewer and runs in visitors&apos; browsers once approved.</>}
                {facts.diskSamples > 0 && <><br />⚠️ {facts.diskSamples} sample node(s) use audio files from your disk; those files are not included.</>}
              </p>

              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '8px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
                <span style={{ fontSize: 12 }}>This is my own work (or I may share it), and it may be published publicly under the MIT license.</span>
              </label>

              {(blocked || (error && !blocked)) && <p style={{ ...note, color: '#ff8080' }}>{blocked || error}</p>}
              {!blocked && !error && problem && <p style={note}>{problem}</p>}
            </>
          )}

          <div style={{ textAlign: 'right', marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {isPublishConfigured() && session && !result && (
              <button style={btn(true, busy || !!problem || !!blocked)} disabled={busy || !!problem || !!blocked} onClick={onPublish}>
                {busy ? 'Publishing…' : 'Publish to GitHub'}
              </button>
            )}
            {!session && error && <span style={{ ...note, color: '#ff8080', flex: 1, textAlign: 'left', margin: 0 }}>{error}</span>}
            <Dialog.Close asChild><button style={btn()}>{result ? 'Done' : 'Cancel'}</button></Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
