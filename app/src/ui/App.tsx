import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, clearTokens, getApiBase, loadTokens, setApiBase, setTokens } from './api';

type Category = { id: string; name: string; sections: Array<{ id: string; name: string; sortOrder: number }> };
type Entry = {
  id: string;
  title?: string | null;
  promptText: string;
  outputText: string;
  modelUsed: string;
  comments?: string | null;
  categoryId: string;
  sectionId?: string | null;
  tags: Array<{ id: string; name: string }>;
  updatedAt: string;
  deletedAt?: string | null;
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
      {children}
    </div>
  );
}

function iconBtnStyle(): React.CSSProperties {
  return { padding: '6px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'inherit' };
}

export function App() {
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState<{ email: string; role: 'ADMIN' | 'USER' } | null>(null);

  const [conn, setConn] = useState<{ ok: boolean; text: string }>({ ok: false, text: 'Not connected' });
  const [serverCfg, setServerCfg] = useState<any | null>(null);

  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin1234');
  const [err, setErr] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [sectionId, setSectionId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => entries.find(e => e.id === selectedId) ?? null, [entries, selectedId]);

  const [editor, setEditor] = useState({ title: '', promptText: '', outputText: '', modelUsed: '', comments: '', tags: '' });
  const [dirty, setDirty] = useState(false);
  const autoSaveTimer = useRef<number | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newEntry, setNewEntry] = useState({ title: '', promptText: '', outputText: '', modelUsed: '', comments: '', tags: '' });
  const [newErr, setNewErr] = useState<string | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [apiBase, setApiBaseState] = useState(getApiBase());
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  async function refreshConnection() {
    try {
      await api.health();
      const cfg = await api.config();
      setServerCfg(cfg);
      setConn({
        ok: true,
        text: `Connected • v${cfg.appVersion} • ${cfg.environment} • ${cfg.dbType}${cfg.dbPath ? ' • ' + cfg.dbPath : ''}`,
      });
    } catch {
      setServerCfg(null);
      setConn({ ok: false, text: 'Not connected' });
    }
  }

  useEffect(() => {
    loadTokens();
    (async () => {
      await refreshConnection();
      try {
        const me = await api.me();
        setUser({ email: me.email, role: me.role });
      } catch {}
      setBooted(true);
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const cats = await api.categories();
      setCategories(cats);

      const cfg = serverCfg ?? (await api.config().catch(() => null));
      const defaults = cfg?.defaults;

      const desiredCat = defaults?.defaultCategoryId && cats.some(c => c.id === defaults.defaultCategoryId)
        ? defaults.defaultCategoryId
        : (cats[0]?.id ?? '');

      setCategoryId(desiredCat);

      const chosenCat = cats.find(c => c.id === desiredCat);
      const desiredSec = defaults?.defaultSectionId && chosenCat?.sections?.some(s => s.id === defaults.defaultSectionId)
        ? defaults.defaultSectionId
        : (chosenCat?.sections?.slice().sort((a,b)=> (a.sortOrder-b.sortOrder) || a.name.localeCompare(b.name))[0]?.id ?? '');

      setSectionId(desiredSec);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refreshEntries() {
    if (!user || !categoryId) return;
    const data = await api.entries({
      query: query || undefined,
      categoryId,
      sectionId: sectionId || undefined,
      tag: tagFilter || undefined,
      includeDeleted: showDeleted ? 'true' : undefined,
    });

    const filtered = showDeleted ? data.filter((e: any) => e.deletedAt) : data.filter((e: any) => !e.deletedAt);

    setEntries(filtered);
    if (filtered.length && !selectedId) setSelectedId(filtered[0].id);
    if (selectedId && !filtered.some(d => d.id === selectedId)) setSelectedId(filtered[0]?.id ?? null);
  }

  useEffect(() => {
    refreshEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, categoryId, sectionId, query, tagFilter, showDeleted]);

  useEffect(() => {
    if (!selected) return;
    setEditor({
      title: selected.title ?? '',
      promptText: selected.promptText ?? '',
      outputText: selected.outputText ?? '',
      modelUsed: selected.modelUsed ?? '',
      comments: selected.comments ?? '',
      tags: (selected.tags ?? []).map((t: any) => t.name).join(', '),
    });
    setDirty(false);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty) return;
    if (!selected || selected.deletedAt) return;

    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      saveSelected().catch(() => {});
    }, 1500);

    return () => {
      if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, dirty]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveSelected().catch(() => {});
      }
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNew();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, sectionId, selectedId, editor]);

  async function doLogin() {
    setErr(null);
    try {
      const res = await api.login(email, password);
      setTokens(res.accessToken, res.refreshToken);
      setUser({ email: res.user.email, role: res.user.role });
      await refreshConnection();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Login failed');
    }
  }

  function logout() {
    clearTokens();
    setUser(null);
    setEntries([]);
    setCategories([]);
    setSelectedId(null);
  }

  async function saveSelected() {
    if (!selected) return;
    if (selected.deletedAt) return;
    const tags = editor.tags.split(',').map(s => s.trim()).filter(Boolean);
    if (!editor.promptText.trim() || !editor.outputText.trim() || !editor.modelUsed.trim()) return;

    await api.updateEntry(selected.id, {
      title: editor.title || null,
      promptText: editor.promptText,
      outputText: editor.outputText,
      modelUsed: editor.modelUsed,
      comments: editor.comments || null,
      categoryId,
      sectionId: sectionId || null,
      tags,
    });
    setDirty(false);
    await refreshEntries();
  }

  function createNew() {
    setNewErr(null);
    setNewEntry({ title: '', promptText: '', outputText: '', modelUsed: '', comments: '', tags: '' });
    setShowNew(true);
  }

  async function submitNew() {
    setNewErr(null);
    const tags = newEntry.tags.split(',').map(s => s.trim()).filter(Boolean);
    if (!newEntry.promptText.trim()) return setNewErr('Prompt is required.');
    if (!newEntry.outputText.trim()) return setNewErr('Output is required.');
    if (!newEntry.modelUsed.trim()) return setNewErr('Model used is required.');

    const res = await api.createEntry({
      categoryId,
      sectionId: sectionId || null,
      title: newEntry.title || null,
      promptText: newEntry.promptText,
      outputText: newEntry.outputText,
      modelUsed: newEntry.modelUsed,
      comments: newEntry.comments || null,
      tags,
    });
    await refreshEntries();
    setSelectedId(res.id);
    setShowNew(false);
  }

  async function deleteSelected(hard: boolean) {
    if (!selected) return;
    if (hard) await api.hardDeleteEntry(selected.id);
    else await api.deleteEntry(selected.id);
    await refreshEntries();
  }

  async function restoreSelected() {
    if (!selected) return;
    await api.restoreEntry(selected.id);
    await refreshEntries();
  }

  if (!booted) return <div style={{ padding: 24 }}>Loading…</div>;

  if (!user) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', padding: 24 }}>
        <div style={{ width: 460 }}>
          <h1 style={{ margin: 0, marginBottom: 12 }}>PromptVault</h1>
          <Card>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Status</div>
                <button onClick={() => setShowSettings(true)} style={iconBtnStyle()}>⚙</button>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{conn.text}</div>

              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Email</div>
                <input value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit' }} />
              </label>
              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Password</div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit' }} />
              </label>
              {err && <div style={{ color: '#ff8a8a' }}>{err}</div>}
              <button onClick={doLogin} style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: 'inherit' }}>Log in</button>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Admin UI: open <code>{getApiBase().replace(/\/$/, '')}/ui</code></div>
            </div>
          </Card>
        </div>

        {showSettings ? (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
            <div style={{ width: 560, maxWidth: '92vw', background: 'rgba(15,20,28,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Settings</div>
                <button onClick={() => setShowSettings(false)} style={iconBtnStyle()}>✕</button>
              </div>
              <div style={{ height: 10 }} />
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Server URL</div>
                <input value={apiBase} onChange={e => setApiBaseState(e.target.value)} placeholder="http://localhost:8787"
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit' }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={async () => { setApiBase(apiBase); await refreshConnection(); setSettingsMsg('Test complete.'); }} style={iconBtnStyle()}>Test</button>
                  <button onClick={async () => { setApiBase(apiBase); await refreshConnection(); setShowSettings(false); }} style={{ ...iconBtnStyle(), background: 'rgba(255,255,255,0.07)' }}>Save</button>
                </div>
                {settingsMsg ? <div style={{ fontSize: 12, opacity: 0.8 }}>{settingsMsg}</div> : null}
                {serverCfg ? (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Server: v{serverCfg.appVersion} • {serverCfg.environment} • {serverCfg.dbType}{serverCfg.dbPath ? ` • ${serverCfg.dbPath}` : ''}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const activeCategory = categories.find(c => c.id === categoryId) ?? null;
  const sections = (activeCategory?.sections ?? []).slice().sort((a,b)=> (a.sortOrder-b.sortOrder) || a.name.localeCompare(b.name));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: '100vh' }}>
      <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', padding: 12, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700 }}>PromptVault</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{user.email} ({user.role})</div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>{conn.text}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setShowSettings(true)} title="Settings" style={iconBtnStyle()}>⚙</button>
            <button onClick={logout} title="Log out" style={iconBtnStyle()}>⎋</button>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Categories</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {categories.map(c => (
              <button key={c.id} onClick={() => { setCategoryId(c.id); setSectionId(c.sections?.[0]?.id ?? ''); setSelectedId(null); }}
                style={{ textAlign: 'left', padding: '10px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: c.id === categoryId ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)', color: 'inherit' }}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Search</div>
          <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search… (Ctrl+F)"
            style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit' }} />
          <div style={{ height: 8 }} />
          <input value={tagFilter} onChange={e => setTagFilter(e.target.value)} placeholder="Tag filter…"
            style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit' }} />
          <div style={{ height: 10 }} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.85 }}>
            <input type="checkbox" checked={showDeleted} onChange={e => { setShowDeleted(e.target.checked); setSelectedId(null); }} />
            Show deleted items
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateRows: '54px 1fr' }}>
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: 10, display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto' }}>
          {sections.map(s => (
            <button key={s.id} onClick={() => { setSectionId(s.id); setSelectedId(null); }}
              style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.10)', background: s.id === sectionId ? 'rgba(255,255,255,0.10)' : 'transparent', color: 'inherit', whiteSpace: 'nowrap' }}>
              {s.name}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={createNew} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: 'inherit' }}>+ New (Ctrl+N)</button>
        </div>

        {showNew ? (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
            <div style={{ width: 720, maxWidth: '92vw', background: 'rgba(15,20,28,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontWeight: 800 }}>New entry</div>
                <button onClick={() => setShowNew(false)} style={iconBtnStyle()}>✕</button>
              </div>
              <div style={{ height: 10 }} />
              <div style={{ display: 'grid', gap: 10 }}>
                <input value={newEntry.title} onChange={e => setNewEntry(p => ({ ...p, title: e.target.value }))} placeholder="Title (optional)"
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit' }} />
                <input value={newEntry.modelUsed} onChange={e => setNewEntry(p => ({ ...p, modelUsed: e.target.value }))} placeholder="Model used (required)"
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit' }} />
                <textarea value={newEntry.comments} onChange={e => setNewEntry(p => ({ ...p, comments: e.target.value }))} placeholder="Comments (optional)"
                  style={{ width: '100%', minHeight: 90, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit', resize: 'vertical' }} />
                <input value={newEntry.tags} onChange={e => setNewEntry(p => ({ ...p, tags: e.target.value }))} placeholder="Tags (comma-separated)"
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit' }} />
                <textarea value={newEntry.promptText} onChange={e => setNewEntry(p => ({ ...p, promptText: e.target.value }))} placeholder="Prompt (required)"
                  style={{ width: '100%', minHeight: 140, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit', resize: 'vertical' }} />
                <textarea value={newEntry.outputText} onChange={e => setNewEntry(p => ({ ...p, outputText: e.target.value }))} placeholder="Output (required)"
                  style={{ width: '100%', minHeight: 180, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit', resize: 'vertical' }} />
                {newErr ? <div style={{ color: '#ff8a8a' }}>{newErr}</div> : null}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowNew(false)} style={iconBtnStyle()}>Cancel</button>
                  <button onClick={submitNew} style={{ ...iconBtnStyle(), background: 'rgba(255,255,255,0.07)' }}>Create</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {showSettings ? (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
            <div style={{ width: 560, maxWidth: '92vw', background: 'rgba(15,20,28,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Settings</div>
                <button onClick={() => setShowSettings(false)} style={iconBtnStyle()}>✕</button>
              </div>
              <div style={{ height: 10 }} />
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Server URL</div>
                <input value={apiBase} onChange={e => setApiBaseState(e.target.value)} placeholder="http://localhost:8787"
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit' }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={async () => { setApiBase(apiBase); await refreshConnection(); setSettingsMsg('Test complete.'); }} style={iconBtnStyle()}>Test</button>
                  <button onClick={async () => { setApiBase(apiBase); await refreshConnection(); setShowSettings(false); }} style={{ ...iconBtnStyle(), background: 'rgba(255,255,255,0.07)' }}>Save</button>
                </div>
                {settingsMsg ? <div style={{ fontSize: 12, opacity: 0.8 }}>{settingsMsg}</div> : null}
                {serverCfg ? (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Server: v{serverCfg.appVersion} • {serverCfg.environment} • {serverCfg.dbType}{serverCfg.dbPath ? ` • ${serverCfg.dbPath}` : ''}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, opacity: 0.6 }}>Database is managed by the server (read-only from the client).</div>
              </div>
            </div>
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', height: '100%' }}>
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', padding: 12, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Entries</div>
              {dirty && selected && !selected.deletedAt ? <div style={{ fontSize: 12, opacity: 0.9 }}>● Unsaved</div> : null}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {entries.map(e => (
                <button key={e.id} onClick={() => setSelectedId(e.id)}
                  style={{ textAlign: 'left', padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: e.id === selectedId ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.03)', color: 'inherit' }}>
                  <div style={{ fontWeight: 650 }}>{(e.title || 'Untitled').slice(0, 80)} {e.deletedAt ? <span style={{ fontSize: 12, opacity: 0.7 }}>(deleted)</span> : null}</div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{(e.promptText || '').slice(0, 120)}{(e.promptText || '').length > 120 ? '…' : ''}</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{e.modelUsed}</div>
                </button>
              ))}
              {!entries.length && <div style={{ opacity: 0.7 }}>No entries.</div>}
            </div>
          </div>

          <div style={{ padding: 12, overflow: 'auto' }}>
            {!selected ? <div style={{ opacity: 0.7 }}>Select an entry.</div> : (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={editor.title} onChange={e => { setEditor(p => ({ ...p, title: e.target.value })); setDirty(true); }} placeholder="Title"
                    style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit', fontWeight: 700 }} />
                  {!selected.deletedAt ? (
                    <>
                      <button onClick={() => saveSelected()} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: 'inherit' }}>Save (Ctrl+S)</button>
                      <button onClick={() => deleteSelected(false)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'inherit' }}>Delete</button>
                      <button onClick={() => deleteSelected(true)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'inherit' }}>Purge</button>
                    </>
                  ) : (
                    <>
                      <button onClick={restoreSelected} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: 'inherit' }}>Restore</button>
                      <button onClick={() => deleteSelected(true)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'inherit' }}>Purge</button>
                    </>
                  )}
                </div>

                <Card>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Model used (required)</div>
                  <input value={editor.modelUsed} onChange={e => { setEditor(p => ({ ...p, modelUsed: e.target.value })); setDirty(true); }} placeholder="e.g. GPT-4.1, Claude 3.5"
                    style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit' }} />
                </Card>

                <Card>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Comments</div>
                  <textarea value={editor.comments} onChange={e => { setEditor(p => ({ ...p, comments: e.target.value })); setDirty(true); }} placeholder="Optional comments…"
                    style={{ width: '100%', minHeight: 90, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit', resize: 'vertical' }} />
                </Card>

                <Card>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Tags (comma-separated)</div>
                  <input value={editor.tags} onChange={e => { setEditor(p => ({ ...p, tags: e.target.value })); setDirty(true); }} placeholder="e.g. pricing, email"
                    style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit' }} />
                </Card>

                <Card>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Prompt (required)</div>
                  <textarea value={editor.promptText} onChange={e => { setEditor(p => ({ ...p, promptText: e.target.value })); setDirty(true); }} placeholder="Paste prompt…"
                    style={{ width: '100%', minHeight: 160, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit', resize: 'vertical' }} />
                </Card>

                <Card>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Output (required)</div>
                  <textarea value={editor.outputText} onChange={e => { setEditor(p => ({ ...p, outputText: e.target.value })); setDirty(true); }} placeholder="Paste output…"
                    style={{ width: '100%', minHeight: 240, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'inherit', resize: 'vertical' }} />
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
