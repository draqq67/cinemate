import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import { useAuth } from '../hooks/useAuth';
import { getLists, getMyLists, createList, deleteList } from '../api/lists';

const POSTER = 'https://image.tmdb.org/t/p/w185';
const LABEL  = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--lb-text-muted)',
};

function ListCard({ list }) {
  const previews = list.preview_posters?.filter(Boolean) || [];
  return (
    <Link to={`/lists/${list.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px',
        overflow: 'hidden', transition: 'transform 0.15s, border-color 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--lb-border-2)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--lb-border)'; }}
      >
        {/* Poster strip */}
        <div style={{ display: 'flex', height: 80, background: 'var(--lb-bg-3)', overflow: 'hidden' }}>
          {previews.length > 0
            ? previews.map((p, i) => (
                <img key={i} src={`${POSTER}${p}`} alt="" style={{ flex: 1, objectFit: 'cover', minWidth: 0 }} />
              ))
            : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--lb-text-muted)', fontSize: '12px' }}>No films yet</div>
          }
        </div>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--lb-text-bright)', marginBottom: '4px', lineHeight: 1.3 }}>{list.title}</div>
          {list.description && (
            <div style={{ fontSize: '12px', color: 'var(--lb-text)', marginBottom: '8px', lineHeight: 1.4,
              overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {list.description}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '11px', color: 'var(--lb-text-muted)' }}>by {list.username}</span>
            <span style={{ fontSize: '11px', color: 'var(--lb-text-muted)' }}>{list.movie_count} films</span>
            <span style={{ fontSize: '11px', color: 'var(--lb-text-muted)' }}>{list.follower_count} followers</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function ListsPage() {
  const { user } = useAuth();
  const [lists, setLists] = useState([]);
  const [myLists, setMyLists] = useState([]);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState('browse');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle]   = useState('');
  const [newDesc, setNewDesc]     = useState('');
  const [newPublic, setNewPublic] = useState(true);
  const [creating, setCreating]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [loadingMine, setLoadingMine] = useState(true);

  const fetchLists = useCallback(async () => {
    const params = { search };
    const r = await getLists(params);
    setLists(r.data.lists);
    setTotal(r.data.total);
  }, [search]);

  const fetchMine = useCallback(async () => {
    if (!user) return;
    const r = await getMyLists();
    setMyLists(r.data.lists);
  }, [user]);

  useEffect(() => { setLoading(true); fetchLists().finally(() => setLoading(false)); }, [fetchLists]);
  useEffect(() => { if (tab === 'mine') { setLoadingMine(true); fetchMine().finally(() => setLoadingMine(false)); } }, [tab, fetchMine]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createList({ title: newTitle.trim(), description: newDesc.trim(), is_public: newPublic });
      setNewTitle(''); setNewDesc(''); setNewPublic(true); setShowCreate(false);
      fetchMine();
    } finally { setCreating(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this list?')) return;
    await deleteList(id);
    fetchMine();
  };

  const tabStyle = (t) => ({
    padding: '8px 16px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', cursor: 'pointer', border: 'none', background: 'none',
    color: tab === t ? 'var(--lb-green)' : 'var(--lb-text)',
    borderBottom: tab === t ? '2px solid var(--lb-green)' : '2px solid transparent',
    marginBottom: '-1px',
  });

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={LABEL}>Community</div>
            <h1 style={{ margin: '4px 0 0', fontSize: '28px', color: 'var(--lb-text-bright)' }}>Lists</h1>
          </div>
          {user && (
            <button onClick={() => setShowCreate(true)} style={{
              padding: '8px 18px', borderRadius: '4px', border: 'none',
              background: 'var(--lb-green)', color: 'var(--lb-bg)',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>+ New list</button>
          )}
        </div>

        {/* Create modal */}
        {showCreate && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
            <div style={{ background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px', padding: '28px', maxWidth: '420px', width: '100%', margin: '0 20px' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: '18px', color: 'var(--lb-text-bright)' }}>Create list</h2>
              <form onSubmit={handleCreate}>
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ ...LABEL, marginBottom: '6px' }}>Title</div>
                  <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                    placeholder="e.g. Best 90s Sci-Fi" style={{ width: '100%', boxSizing: 'border-box' }} autoFocus />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ ...LABEL, marginBottom: '6px' }}>Description (optional)</div>
                  <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
                    rows={3} placeholder="What's this list about?" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
                </div>
                {/* Public / Private toggle */}
                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' }}>Visibility</div>
                  <div style={{ display: 'flex', background: 'var(--lb-bg-3)', border: '1px solid var(--lb-border-2)', borderRadius: 4, overflow: 'hidden' }}>
                    {[['public', '🌍 Public'], ['private', '🔒 Private']].map(([val, label]) => (
                      <button key={val} type="button" onClick={() => setNewPublic(val === 'public')}
                        style={{
                          padding: '5px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          border: 'none', letterSpacing: '0.04em',
                          background: (newPublic === (val === 'public')) ? 'var(--lb-green)' : 'none',
                          color: (newPublic === (val === 'public')) ? 'var(--lb-bg)' : 'var(--lb-text)',
                        }}>{label}</button>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--lb-text-muted)' }}>
                    {newPublic ? 'Visible to everyone' : 'Only visible to you'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowCreate(false)} style={{
                    padding: '7px 16px', border: '1px solid var(--lb-border-2)', borderRadius: '4px',
                    background: 'none', color: 'var(--lb-text)', cursor: 'pointer', fontSize: '12px',
                  }}>Cancel</button>
                  <button type="submit" disabled={creating || !newTitle.trim()} style={{
                    padding: '7px 16px', borderRadius: '4px', border: 'none',
                    background: 'var(--lb-green)', color: 'var(--lb-bg)',
                    fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                    opacity: creating ? 0.6 : 1,
                  }}>Create</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid var(--lb-border)', marginBottom: '24px', display: 'flex', gap: '0' }}>
          <button style={tabStyle('browse')} onClick={() => setTab('browse')}>Browse ({total})</button>
          {user && <button style={tabStyle('mine')} onClick={() => setTab('mine')}>My lists</button>}
        </div>

        {tab === 'browse' && (
          <>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search lists…"
              style={{ width: '100%', maxWidth: '360px', marginBottom: '24px', boxSizing: 'border-box' }}
            />
            {loading
              ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 170, borderRadius: 6 }} />
                  ))}
                </div>
              : lists.length === 0
                ? <div style={{ color: 'var(--lb-text-muted)', textAlign: 'center', padding: '60px' }}>No lists found.</div>
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                    {lists.map(l => <ListCard key={l.id} list={l} />)}
                  </div>
            }
          </>
        )}

        {tab === 'mine' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loadingMine && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 6 }} />
            ))}
            {!loadingMine && myLists.length === 0 && (
              <div style={{ color: 'var(--lb-text-muted)', textAlign: 'center', padding: '60px' }}>
                You haven't created any lists yet.
              </div>
            )}
            {!loadingMine && myLists.map(l => (
              <div key={l.id} style={{
                display: 'flex', alignItems: 'center', gap: '16px',
                background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)',
                borderRadius: '6px', padding: '14px 16px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={`/lists/${l.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--lb-text-bright)' }}>{l.title}</div>
                  </Link>
                  <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginTop: '3px' }}>
                    {l.movie_count} films · {l.is_public ? 'Public' : 'Private'}
                  </div>
                </div>
                <button onClick={() => handleDelete(l.id)} style={{
                  padding: '4px 10px', borderRadius: '3px', border: '1px solid rgba(248,113,113,0.3)',
                  background: 'rgba(248,113,113,0.1)', color: '#f87171',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                }}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
