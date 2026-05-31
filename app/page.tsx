'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ROLES = {
  user: 'User',
  moderator: 'Moderator',
  admin: 'Admin',
  founder: 'Founder'
};

const ROLE_HIERARCHY = {
  user: 0,
  moderator: 1,
  admin: 2,
  founder: 3
};

export default function ShitbinApp() {
  const [page, setPage] = useState('login');
  const [pastes, setPastes] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedPaste, setSelectedPaste] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [expiration, setExpiration] = useState('never');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIn, setSearchIn] = useState('title');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    const storedUser = localStorage.getItem('shitbin_user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
      setPage('home');
    }
    fetchPastes();
    fetchUsers();
    fetchReports();
  }, []);

  const fetchPastes = async () => {
    try {
      const { data, error } = await supabase
        .from('pastes')
        .select('*, creator:users(username, role)')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setPastes(data || []);
    } catch (err) {
      console.error('Error fetching pastes:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*, paste:pastes(title, id), reporter:users(username)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (err) {
      console.error('Error fetching reports:', err);
    }
  };

  const registerUser = async () => {
    if (!username.trim() || !password.trim()) {
      alert('Username and password required.');
      return;
    }

    if (isRegistering && password !== passwordConfirm) {
      alert('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (existingUser) {
        alert('Username already taken.');
        setLoading(false);
        return;
      }

      let passwordHash;
      try {
        const salt = await bcrypt.genSalt(10);
        passwordHash = await bcrypt.hash(password, salt);
      } catch (hashErr) {
        console.error('Bcrypt error:', hashErr);
        alert('Password hashing failed. Try again.');
        setLoading(false);
        return;
      }

      const { data: allUsers } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      const isFirstUser = !allUsers || allUsers.length === 0;
      const role = isFirstUser ? 'founder' : 'user';

      const { data: newUser, error } = await supabase
        .from('users')
        .insert([{
          username,
          password_hash: passwordHash,
          role,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('Registration error:', error);
        throw error;
      }

      setCurrentUser(newUser);
      localStorage.setItem('shitbin_user', JSON.stringify(newUser));
      setUsername('');
      setPassword('');
      setPasswordConfirm('');
      setIsRegistering(false);
      setPage('home');
      fetchUsers();
    } catch (err) {
      console.error('Error registering:', err);
      alert('Registration failed: ' + err.message);
    }
    setLoading(false);
  };

  const loginUser = async () => {
    if (!username.trim() || !password.trim()) {
      alert('Username and password required.');
      return;
    }

    setLoading(true);
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error) {
        console.error('User fetch error:', error);
        alert('User not found.');
        setLoading(false);
        return;
      }

      if (!user) {
        alert('User not found.');
        setLoading(false);
        return;
      }

      let passwordMatch = false;
      try {
        passwordMatch = await bcrypt.compare(password, user.password_hash);
      } catch (compareErr) {
        console.error('Bcrypt compare error:', compareErr);
        alert('Password verification failed. Please try again.');
        setLoading(false);
        return;
      }

      if (!passwordMatch) {
        console.warn('Password mismatch for user:', username);
        alert('Incorrect password.');
        setLoading(false);
        return;
      }

      setCurrentUser(user);
      localStorage.setItem('shitbin_user', JSON.stringify(user));
      setUsername('');
      setPassword('');
      setPage('home');
      fetchPastes();
      fetchUsers();
      fetchReports();
    } catch (err) {
      console.error('Error logging in:', err);
      alert('Login failed: ' + err.message);
    }
    setLoading(false);
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('shitbin_user');
    setPage('login');
  };

  const canModerate = () => {
    return currentUser && ROLE_HIERARCHY[currentUser.role] >= ROLE_HIERARCHY.moderator;
  };

  const canAdmin = () => {
    return currentUser && ROLE_HIERARCHY[currentUser.role] >= ROLE_HIERARCHY.admin;
  };

  const canEdit = (pasteCreatorId) => {
    if (!currentUser) return false;
    if (ROLE_HIERARCHY[currentUser.role] >= ROLE_HIERARCHY.admin) return true;
    return currentUser.id === pasteCreatorId;
  };

  const createPaste = async () => {
    if (!currentUser) {
      alert('You must be logged in to create a paste.');
      return;
    }

    if (!title.trim() || !content.trim()) {
      alert('Title and content required.');
      return;
    }

    setLoading(true);
    try {
      const expiresAt = expiration === 'never' ? null : new Date(Date.now() + getExpirationMs()).toISOString();

      const { error } = await supabase
        .from('pastes')
        .insert([{
          title,
          content,
          expires_at: expiresAt,
          creator_id: currentUser.id,
          pinned: false,
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;

      setTitle('');
      setContent('');
      setExpiration('never');
      setPage('home');
      fetchPastes();
    } catch (err) {
      console.error('Error creating paste:', err);
      alert('Failed to create paste.');
    }
    setLoading(false);
  };

  const getExpirationMs = () => {
    const expirations = {
      '1h': 3600000,
      '24h': 86400000,
      '7d': 604800000,
      '30d': 2592000000
    };
    return expirations[expiration] || 0;
  };

  const togglePinPost = async (id, currentPinned) => {
    if (!canAdmin()) {
      alert('Only admins can pin posts.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('pastes')
        .update({ pinned: !currentPinned })
        .eq('id', id);

      if (error) throw error;
      fetchPastes();
      alert(currentPinned ? 'Post unpinned.' : 'Post pinned!');
    } catch (err) {
      console.error('Error pinning post:', err);
      alert('Failed to pin post.');
    }
    setLoading(false);
  };

  const deletePaste = async (id, creatorId) => {
    if (!canEdit(creatorId)) {
      alert('You do not have permission to delete this paste.');
      return;
    }

    if (!confirm('Delete this paste?')) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('pastes').delete().eq('id', id);
      if (error) throw error;
      fetchPastes();
      setPage('home');
    } catch (err) {
      console.error('Error deleting paste:', err);
      alert('Failed to delete paste.');
    }
    setLoading(false);
  };

  const flagPaste = async (id) => {
    if (!canModerate()) {
      alert('You must be a moderator to flag content.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('pastes')
        .update({ flagged: true, flag_reason: 'Flagged by moderator' })
        .eq('id', id);

      if (error) throw error;
      fetchPastes();
      setPage('home');
      alert('Paste flagged for review.');
    } catch (err) {
      console.error('Error flagging paste:', err);
      alert('Failed to flag paste.');
    }
    setLoading(false);
  };

  const reportPaste = async (pasteId) => {
    if (!currentUser) {
      alert('You must be logged in to report content.');
      return;
    }

    const reason = prompt('Why are you reporting this paste?');
    if (!reason) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('reports').insert([{
        paste_id: pasteId,
        reporter_id: currentUser.id,
        reason,
        created_at: new Date().toISOString()
      }]);

      if (error) throw error;
      fetchReports();
      alert('Report submitted. Thank you!');
      setPage('home');
    } catch (err) {
      console.error('Error submitting report:', err);
      alert('Failed to submit report.');
    }
    setLoading(false);
  };

  const dismissReport = async (reportId) => {
    if (!canModerate()) {
      alert('You do not have permission to dismiss reports.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('reports').delete().eq('id', reportId);

      if (error) throw error;
      fetchReports();
      alert('Report dismissed.');
    } catch (err) {
      console.error('Error dismissing report:', err);
      alert('Failed to dismiss report.');
    }
    setLoading(false);
  };

  const updateUserRole = async (userId, newRole) => {
    if (!canAdmin()) {
      alert('You do not have permission to manage users.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      fetchUsers();
      alert(`User role updated to ${ROLES[newRole]}`);
    } catch (err) {
      console.error('Error updating user role:', err);
      alert('Failed to update user role.');
    }
    setLoading(false);
  };

  const deleteUser = async (userId) => {
    if (!canAdmin()) {
      alert('You do not have permission to manage users.');
      return;
    }

    if (!confirm('Delete this user and all their pastes?')) return;

    setLoading(true);
    try {
      await supabase.from('pastes').delete().eq('creator_id', userId);
      const { error } = await supabase.from('users').delete().eq('id', userId);

      if (error) throw error;
      fetchUsers();
      fetchPastes();
      alert('User deleted.');
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Failed to delete user.');
    }
    setLoading(false);
  };

  const openPaste = (paste) => {
    setSelectedPaste(paste);
    setPage('view');
  };

  const searchPastes = async () => {
    if (!searchQuery.trim()) {
      fetchPastes();
      return;
    }

    setLoading(true);
    try {
      let query = supabase.from('pastes').select('*, creator:users(username, role)');

      if (searchIn === 'title') {
        query = query.ilike('title', `%${searchQuery}%`);
      } else {
        query = query.ilike('content', `%${searchQuery}%`);
      }

      const { data, error } = await query.order('pinned', { ascending: false }).order('created_at', { ascending: false });

      if (error) throw error;
      setPastes(data || []);
    } catch (err) {
      console.error('Error searching:', err);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black text-cyan-400 font-mono">
      {/* Header */}
      {currentUser && (
        <header className="border-b border-cyan-600/30 p-6">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <h1
              onClick={() => setPage('home')}
              className="text-4xl font-bold tracking-wider cursor-pointer hover:text-cyan-300 transition"
            >
              SHITBIN
            </h1>
            <nav className="flex gap-6 items-center">
              <button
                onClick={() => setPage('home')}
                className={`text-sm uppercase tracking-widest transition ${
                  page === 'home' ? 'text-cyan-300' : 'text-cyan-600 hover:text-cyan-400'
                }`}
              >
                HOME
              </button>
              <button
                onClick={() => setPage('create')}
                className={`text-sm uppercase tracking-widest transition ${
                  page === 'create' ? 'text-cyan-300' : 'text-cyan-600 hover:text-cyan-400'
                }`}
              >
                NEW PASTE
              </button>
              <button
                onClick={() => setPage('users')}
                className={`text-sm uppercase tracking-widest transition ${
                  page === 'users' ? 'text-cyan-300' : 'text-cyan-600 hover:text-cyan-400'
                }`}
              >
                USERS
              </button>
              {canModerate() && (
                <>
                  <button
                    onClick={() => setPage('modqueue')}
                    className={`text-sm uppercase tracking-widest transition ${
                      page === 'modqueue' ? 'text-yellow-300' : 'text-yellow-600 hover:text-yellow-400'
                    }`}
                  >
                    MOD QUEUE
                  </button>
                  <button
                    onClick={() => setPage('reports')}
                    className={`text-sm uppercase tracking-widest transition ${
                      page === 'reports' ? 'text-orange-300' : 'text-orange-600 hover:text-orange-400'
                    }`}
                  >
                    REPORTS ({reports.length})
                  </button>
                </>
              )}
              {canAdmin() && (
                <button
                  onClick={() => setPage('admin')}
                  className={`text-sm uppercase tracking-widest transition ${
                    page === 'admin' ? 'text-red-300' : 'text-red-600 hover:text-red-400'
                  }`}
                >
                  ADMIN PANEL
                </button>
              )}
              <a
                href="https://t.me/shitbinarchive"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm uppercase tracking-widest text-blue-500 hover:text-blue-400 transition"
              >
                📱 TG
              </a>
              <div className="flex items-center gap-4 ml-6 pl-6 border-l border-cyan-600/30">
                <span className="text-xs text-cyan-500">
                  @{currentUser.username} • <span className="text-cyan-300">{ROLES[currentUser.role]}</span>
                </span>
                <button
                  onClick={logout}
                  className="text-xs px-2 py-1 bg-black border border-cyan-600/50 rounded text-cyan-600 hover:text-cyan-400 transition"
                >
                  LOGOUT
                </button>
              </div>
            </nav>
          </div>
        </header>
      )}

      <main className={currentUser ? 'max-w-7xl mx-auto p-6' : ''}>
        {/* LOGIN/REGISTER PAGE */}
        {!currentUser && page === 'login' && (
          <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="w-full max-w-md">
              <div className="bg-black/60 border border-cyan-600/20 rounded p-8 space-y-6">
                <h1 className="text-4xl font-bold tracking-wider text-center text-cyan-300 mb-8">SHITBIN</h1>

                {isRegistering ? (
                  <>
                    <h2 className="text-cyan-300 text-lg uppercase tracking-wider">REGISTER</h2>
                    <div>
                      <label className="block text-cyan-300 text-sm uppercase tracking-widest mb-2">
                        USERNAME
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Choose a username"
                        className="w-full bg-black/80 border border-cyan-600/30 rounded px-4 py-2 text-cyan-400 placeholder-cyan-700 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div>
                      <label className="block text-cyan-300 text-sm uppercase tracking-widest mb-2">
                        PASSWORD
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className="w-full bg-black/80 border border-cyan-600/30 rounded px-4 py-2 text-cyan-400 placeholder-cyan-700 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div>
                      <label className="block text-cyan-300 text-sm uppercase tracking-widest mb-2">
                        CONFIRM PASSWORD
                      </label>
                      <input
                        type="password"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        placeholder="Confirm password"
                        className="w-full bg-black/80 border border-cyan-600/30 rounded px-4 py-2 text-cyan-400 placeholder-cyan-700 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <button
                      onClick={registerUser}
                      disabled={loading}
                      className="w-full px-6 py-2 bg-cyan-600/20 border border-cyan-600 rounded text-cyan-300 uppercase text-sm tracking-widest hover:bg-cyan-600/30 transition disabled:opacity-50"
                    >
                      {loading ? 'REGISTERING...' : 'REGISTER'}
                    </button>

                    <button
                      onClick={() => setIsRegistering(false)}
                      className="w-full px-6 py-2 bg-black border border-cyan-600/30 rounded text-cyan-600 uppercase text-sm tracking-widest hover:text-cyan-400 transition"
                    >
                      BACK TO LOGIN
                    </button>

                    <div className="text-cyan-700 text-xs pt-4 border-t border-cyan-600/20">
                      <p className="mb-2"><span className="text-cyan-300">⭐ FIRST USER:</span> Becomes owner/founder with full control</p>
                      <p><span className="text-cyan-300">👥 OTHERS:</span> Start as regular users</p>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-cyan-300 text-lg uppercase tracking-wider">LOGIN</h2>
                    <div>
                      <label className="block text-cyan-300 text-sm uppercase tracking-widest mb-2">
                        USERNAME
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Your username"
                        onKeyDown={(e) => e.key === 'Enter' && loginUser()}
                        className="w-full bg-black/80 border border-cyan-600/30 rounded px-4 py-2 text-cyan-400 placeholder-cyan-700 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div>
                      <label className="block text-cyan-300 text-sm uppercase tracking-widest mb-2">
                        PASSWORD
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Your password"
                        onKeyDown={(e) => e.key === 'Enter' && loginUser()}
                        className="w-full bg-black/80 border border-cyan-600/30 rounded px-4 py-2 text-cyan-400 placeholder-cyan-700 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <button
                      onClick={loginUser}
                      disabled={loading}
                      className="w-full px-6 py-2 bg-cyan-600/20 border border-cyan-600 rounded text-cyan-300 uppercase text-sm tracking-widest hover:bg-cyan-600/30 transition disabled:opacity-50"
                    >
                      {loading ? 'LOGGING IN...' : 'LOGIN'}
                    </button>

                    <button
                      onClick={() => setIsRegistering(true)}
                      className="w-full px-6 py-2 bg-black border border-cyan-600/30 rounded text-cyan-600 uppercase text-sm tracking-widest hover:text-cyan-400 transition"
                    >
                      REGISTER NEW ACCOUNT
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* HOME PAGE */}
        {currentUser && page === 'home' && (
          <div className="space-y-8">
            <div className="bg-black/60 border border-cyan-600/20 rounded p-6 space-y-4">
              <h2 className="text-cyan-300 text-lg uppercase tracking-wider">SEARCH FOR A PASTE</h2>
              <div className="flex gap-4">
                <div className="flex-1 flex gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="title"
                      checked={searchIn === 'title'}
                      onChange={(e) => setSearchIn(e.target.value)}
                      className="accent-cyan-500"
                    />
                    <span className="text-sm">SEARCH IN TITLE</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="content"
                      checked={searchIn === 'content'}
                      onChange={(e) => setSearchIn(e.target.value)}
                      className="accent-cyan-500"
                    />
                    <span className="text-sm">SEARCH IN CONTENT</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search for..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchPastes()}
                  className="flex-1 bg-black/80 border border-cyan-600/30 rounded px-4 py-2 text-cyan-400 placeholder-cyan-700 focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={searchPastes}
                  className="px-6 py-2 bg-black border border-cyan-600/50 rounded text-cyan-400 uppercase text-sm tracking-widest hover:bg-cyan-600/10 transition"
                >
                  SEARCH
                </button>
              </div>
              <p className="text-cyan-700 text-sm">{pastes.length} total pastes</p>
            </div>

            {/* PASTES TABLE */}
            <div className="bg-black/60 border border-cyan-600/20 rounded p-6">
              <h2 className="text-cyan-300 text-lg uppercase tracking-wider mb-4">RECENT PASTES</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cyan-600/30">
                      <th className="text-left py-3 px-4 text-cyan-300 uppercase tracking-widest text-xs">TITLE</th>
                      <th className="text-left py-3 px-4 text-cyan-300 uppercase tracking-widest text-xs">CREATOR</th>
                      <th className="text-left py-3 px-4 text-cyan-300 uppercase tracking-widest text-xs">CREATED AT</th>
                      <th className="text-left py-3 px-4 text-cyan-300 uppercase tracking-widest text-xs">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastes.map((paste) => (
                      <tr key={paste.id} className={`border-b border-cyan-600/10 hover:bg-cyan-600/5 transition cursor-pointer ${paste.flagged ? 'bg-red-900/10' : ''} ${paste.pinned ? 'bg-yellow-900/10' : ''}`}>
                        <td className="py-3 px-4 text-cyan-400">
                          {paste.pinned && <span className="text-yellow-400 text-xs mr-2">📌</span>}
                          {paste.title} {paste.flagged && <span className="text-red-400 text-xs ml-2">[FLAGGED]</span>}
                        </td>
                        <td className="py-3 px-4 text-cyan-600">
                          @{paste.creator?.username} <span className="text-cyan-700">({ROLES[paste.creator?.role] || 'User'})</span>
                        </td>
                        <td className="py-3 px-4 text-cyan-700">
                          {new Date(paste.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => openPaste(paste)}
                            className="text-cyan-500 hover:text-cyan-300 transition text-xs uppercase tracking-widest"
                          >
                            VIEW
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pastes.length === 0 && (
                <p className="text-cyan-700 text-center py-8">No pastes yet. Create one!</p>
              )}
            </div>
          </div>
        )}

        {/* USERS PAGE */}
        {currentUser && page === 'users' && (
          <div className="space-y-6">
            <div className="bg-black/60 border border-cyan-600/20 rounded p-6">
              <h2 className="text-cyan-300 text-lg uppercase tracking-wider mb-4">USERS ({users.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cyan-600/30">
                      <th className="text-left py-3 px-4 text-cyan-300 uppercase tracking-widest text-xs">USERNAME</th>
                      <th className="text-left py-3 px-4 text-cyan-300 uppercase tracking-widest text-xs">ROLE</th>
                      <th className="text-left py-3 px-4 text-cyan-300 uppercase tracking-widest text-xs">PASTES</th>
                      <th className="text-left py-3 px-4 text-cyan-300 uppercase tracking-widest text-xs">JOINED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const userPasteCount = pastes.filter((p) => p.creator_id === user.id).length;
                      return (
                        <tr key={user.id} className="border-b border-cyan-600/10 hover:bg-cyan-600/5 transition">
                          <td className="py-3 px-4 text-cyan-400">@{user.username}</td>
                          <td className="py-3 px-4 text-cyan-600">{ROLES[user.role]}</td>
                          <td className="py-3 px-4 text-cyan-600">{userPasteCount}</td>
                          <td className="py-3 px-4 text-cyan-700">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* CREATE PAGE */}
        {currentUser && page === 'create' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-black/60 border border-cyan-600/20 rounded p-6 space-y-4">
              <h2 className="text-cyan-300 text-lg uppercase tracking-wider">NEW PASTE</h2>

              <div>
                <label className="block text-cyan-300 text-sm uppercase tracking-widest mb-2">TITLE</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Untitled"
                  className="w-full bg-black/80 border border-cyan-600/30 rounded px-4 py-2 text-cyan-400 placeholder-cyan-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-cyan-300 text-sm uppercase tracking-widest mb-2">CONTENT</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste your content here..."
                  className="w-full h-64 bg-black/80 border border-cyan-600/30 rounded px-4 py-2 text-cyan-400 placeholder-cyan-700 focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-cyan-300 text-sm uppercase tracking-widest mb-2">EXPIRATION</label>
                <select
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  className="w-full bg-black/80 border border-cyan-600/30 rounded px-4 py-2 text-cyan-400 focus:outline-none focus:border-cyan-500"
                >
                  <option value="never">Never</option>
                  <option value="1h">1 Hour</option>
                  <option value="24h">24 Hours</option>
                  <option value="7d">7 Days</option>
                  <option value="30d">30 Days</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={createPaste}
                  disabled={loading}
                  className="px-6 py-2 bg-cyan-600/20 border border-cyan-600 rounded text-cyan-300 uppercase text-sm tracking-widest hover:bg-cyan-600/30 transition disabled:opacity-50"
                >
                  {loading ? 'CREATING...' : 'CREATE PASTE'}
                </button>
                <button
                  onClick={() => setPage('home')}
                  className="px-6 py-2 bg-black border border-cyan-600/30 rounded text-cyan-600 uppercase text-sm tracking-widest hover:text-cyan-400 transition"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW PAGE */}
        {currentUser && page === 'view' && selectedPaste && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-black/60 border border-cyan-600/20 rounded p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-cyan-300 text-2xl uppercase tracking-wider mb-2">
                    {selectedPaste.pinned && <span className="text-yellow-400 mr-2">📌</span>}
                    {selectedPaste.title}
                    {selectedPaste.flagged && <span className="text-red-400 text-sm ml-2">[FLAGGED]</span>}
                  </h2>
                  <p className="text-cyan-700 text-sm">
                    By: <span className="text-cyan-500">@{selectedPaste.creator?.username}</span> ({ROLES[selectedPaste.creator?.role] || 'User'}) • Created:{' '}
                    <span className="text-cyan-600">{new Date(selectedPaste.created_at).toLocaleString()}</span>
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {!canModerate() && (
                    <button
                      onClick={() => reportPaste(selectedPaste.id)}
                      className="px-4 py-2 bg-orange-900/20 border border-orange-700 rounded text-orange-400 text-xs uppercase tracking-widest hover:bg-orange-900/40 transition"
                    >
                      REPORT
                    </button>
                  )}
                  {canEdit(selectedPaste.creator_id) && (
                    <button
                      onClick={() => deletePaste(selectedPaste.id, selectedPaste.creator_id)}
                      className="px-4 py-2 bg-red-900/20 border border-red-700 rounded text-red-400 text-xs uppercase tracking-widest hover:bg-red-900/40 transition"
                    >
                      DELETE
                    </button>
                  )}
                  {canAdmin() && (
                    <button
                      onClick={() => togglePinPost(selectedPaste.id, selectedPaste.pinned)}
                      className="px-4 py-2 bg-yellow-900/20 border border-yellow-700 rounded text-yellow-400 text-xs uppercase tracking-widest hover:bg-yellow-900/40 transition"
                    >
                      {selectedPaste.pinned ? 'UNPIN' : 'PIN'}
                    </button>
                  )}
                  {canModerate() && !selectedPaste.flagged && (
                    <button
                      onClick={() => flagPaste(selectedPaste.id)}
                      className="px-4 py-2 bg-yellow-900/20 border border-yellow-700 rounded text-yellow-400 text-xs uppercase tracking-widest hover:bg-yellow-900/40 transition"
                    >
                      FLAG
                    </button>
                  )}
                </div>
              </div>

              <pre className="bg-black/80 border border-cyan-600/30 rounded p-4 overflow-auto max-h-96 text-xs leading-relaxed">
                <code>{selectedPaste.content}</code>
              </pre>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedPaste.content);
                    alert('Copied to clipboard!');
                  }}
                  className="px-4 py-2 bg-cyan-600/20 border border-cyan-600 rounded text-cyan-300 text-xs uppercase tracking-widest hover:bg-cyan-600/30 transition"
                >
                  COPY
                </button>
                <button
                  onClick={() => setPage('home')}
                  className="px-4 py-2 bg-black border border-cyan-600/30 rounded text-cyan-600 text-xs uppercase tracking-widest hover:text-cyan-400 transition"
                >
                  BACK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MOD QUEUE */}
        {currentUser && page === 'modqueue' && canModerate() && (
          <div className="space-y-6">
            <div className="bg-black/60 border border-yellow-600/20 rounded p-6">
              <h2 className="text-yellow-300 text-lg uppercase tracking-wider mb-4">MODERATION QUEUE</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-yellow-600/30">
                      <th className="text-left py-3 px-4 text-yellow-300 uppercase tracking-widest text-xs">TITLE</th>
                      <th className="text-left py-3 px-4 text-yellow-300 uppercase tracking-widest text-xs">REASON</th>
                      <th className="text-left py-3 px-4 text-yellow-300 uppercase tracking-widest text-xs">FLAGGED AT</th>
                      <th className="text-left py-3 px-4 text-yellow-300 uppercase tracking-widest text-xs">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastes
                      .filter((p) => p.flagged)
                      .map((paste) => (
                        <tr key={paste.id} className="border-b border-yellow-600/10 hover:bg-yellow-600/5 transition">
                          <td className="py-3 px-4 text-yellow-400">{paste.title}</td>
                          <td className="py-3 px-4 text-yellow-600">{paste.flag_reason || 'No reason provided'}</td>
                          <td className="py-3 px-4 text-yellow-700">
                            {new Date(paste.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 flex gap-2">
                            <button
                              onClick={() => openPaste(paste)}
                              className="text-yellow-500 hover:text-yellow-300 text-xs uppercase tracking-widest"
                            >
                              VIEW
                            </button>
                            <button
                              onClick={() => deletePaste(paste.id, paste.creator_id)}
                              className="text-red-500 hover:text-red-300 text-xs uppercase tracking-widest"
                            >
                              DELETE
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {pastes.filter((p) => p.flagged).length === 0 && (
                <p className="text-yellow-700 text-center py-8">No flagged content.</p>
              )}
            </div>
          </div>
        )}

        {/* REPORTS PAGE */}
        {currentUser && page === 'reports' && canModerate() && (
          <div className="space-y-6">
            <div className="bg-black/60 border border-orange-600/20 rounded p-6">
              <h2 className="text-orange-300 text-lg uppercase tracking-wider mb-4">USER REPORTS ({reports.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-orange-600/30">
                      <th className="text-left py-3 px-4 text-orange-300 uppercase tracking-widest text-xs">PASTE</th>
                      <th className="text-left py-3 px-4 text-orange-300 uppercase tracking-widest text-xs">REPORTED BY</th>
                      <th className="text-left py-3 px-4 text-orange-300 uppercase tracking-widest text-xs">REASON</th>
                      <th className="text-left py-3 px-4 text-orange-300 uppercase tracking-widest text-xs">DATE</th>
                      <th className="text-left py-3 px-4 text-orange-300 uppercase tracking-widest text-xs">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr key={report.id} className="border-b border-orange-600/10 hover:bg-orange-600/5 transition">
                        <td className="py-3 px-4 text-orange-400">
                          <button
                            onClick={() => {
                              const paste = pastes.find((p) => p.id === report.paste_id);
                              if (paste) {
                                openPaste(paste);
                              }
                            }}
                            className="hover:underline text-orange-500"
                          >
                            {report.paste?.title || '[deleted]'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-orange-600">@{report.reporter?.username || 'Anonymous'}</td>
                        <td className="py-3 px-4 text-orange-600 max-w-xs truncate">{report.reason}</td>
                        <td className="py-3 px-4 text-orange-700">
                          {new Date(report.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 flex gap-2">
                          <button
                            onClick={() => {
                              const paste = pastes.find((p) => p.id === report.paste_id);
                              if (paste) {
                                openPaste(paste);
                              }
                            }}
                            className="text-orange-500 hover:text-orange-300 text-xs uppercase tracking-widest"
                          >
                            VIEW
                          </button>
                          <button
                            onClick={() => dismissReport(report.id)}
                            className="text-green-500 hover:text-green-300 text-xs uppercase tracking-widest"
                          >
                            DISMISS
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reports.length === 0 && (
                <p className="text-orange-700 text-center py-8">No reports. Looks good out there!</p>
              )}
            </div>
          </div>
        )}

        {/* ADMIN PANEL */}
        {currentUser && page === 'admin' && canAdmin() && (
          <div className="space-y-6">
            <div className="bg-black/60 border border-red-600/20 rounded p-6">
              <h2 className="text-red-300 text-lg uppercase tracking-wider mb-4">USER MANAGEMENT</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-red-600/30">
                      <th className="text-left py-3 px-4 text-red-300 uppercase tracking-widest text-xs">USERNAME</th>
                      <th className="text-left py-3 px-4 text-red-300 uppercase tracking-widest text-xs">ROLE</th>
                      <th className="text-left py-3 px-4 text-red-300 uppercase tracking-widest text-xs">PASTES</th>
                      <th className="text-left py-3 px-4 text-red-300 uppercase tracking-widest text-xs">JOINED</th>
                      <th className="text-left py-3 px-4 text-red-300 uppercase tracking-widest text-xs">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const userPasteCount = pastes.filter((p) => p.creator_id === user.id).length;
                      return (
                        <tr key={user.id} className="border-b border-red-600/10 hover:bg-red-600/5 transition">
                          <td className="py-3 px-4 text-red-400">@{user.username}</td>
                          <td className="py-3 px-4 text-red-600">
                            <select
                              value={user.role}
                              onChange={(e) => updateUserRole(user.id, e.target.value)}
                              className="bg-black/80 border border-red-600/30 rounded px-2 py-1 text-red-400 text-xs focus:outline-none"
                            >
                              {Object.entries(ROLES).map(([roleKey, roleName]) => (
                                <option key={roleKey} value={roleKey}>
                                  {roleName}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4 text-red-600">{userPasteCount}</td>
                          <td className="py-3 px-4 text-red-700">{new Date(user.created_at).toLocaleDateString()}</td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => deleteUser(user.id)}
                              className="text-red-500 hover:text-red-300 text-xs uppercase tracking-widest"
                            >
                              DELETE
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SYSTEM STATS */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-black/60 border border-red-600/20 rounded p-4 text-center">
                <p className="text-red-700 text-xs uppercase tracking-widest">Total Users</p>
                <p className="text-red-300 text-2xl font-bold mt-2">{users.length}</p>
              </div>
              <div className="bg-black/60 border border-red-600/20 rounded p-4 text-center">
                <p className="text-red-700 text-xs uppercase tracking-widest">Total Pastes</p>
                <p className="text-red-300 text-2xl font-bold mt-2">{pastes.length}</p>
              </div>
              <div className="bg-black/60 border border-red-600/20 rounded p-4 text-center">
                <p className="text-red-700 text-xs uppercase tracking-widest">Flagged Content</p>
                <p className="text-red-300 text-2xl font-bold mt-2">{pastes.filter((p) => p.flagged).length}</p>
              </div>
              <div className="bg-black/60 border border-red-600/20 rounded p-4 text-center">
                <p className="text-red-700 text-xs uppercase tracking-widest">Pinned Posts</p>
                <p className="text-red-300 text-2xl font-bold mt-2">{pastes.filter((p) => p.pinned).length}</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}