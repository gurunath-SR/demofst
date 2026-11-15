/**
 * MiniBlog Frontend Script
 * Connects the HTML pages to the Express REST API using fetch() and JWT auth.
 */

// Automatically detect API base URL:
// - When served from Express (e.g., http://localhost:5000 or port 3000), use same origin + /api
// - When opened via file:// or a separate static dev server (e.g., Live Server :5500), target :5000
const API_BASE_URL =
  window.location.protocol === 'file:' ||
  (window.location.hostname === 'localhost' && window.location.port === '5500') ||
  (window.location.hostname === '127.0.0.1' && window.location.port === '5500')
    ? 'http://localhost:5000/api'
    : `${window.location.origin}/api`;

const TOKEN_KEY = 'miniblog_token';
const USER_KEY = 'miniblog_user';

// ============================================================================
// Authentication & Session Helpers
// ============================================================================

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getCurrentUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function updateStoredUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function logout() {
  clearSession();
  window.location.href = 'login.html';
}

/**
 * Wrapper around fetch() that automatically attaches the JWT Authorization header
 * and parses JSON errors cleanly.
 */
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  // If token expired or invalid, redirect back to login
  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error(data.message || 'Session expired.');
  }

  if (!response.ok) {
    throw new Error(data.message || 'Request failed.');
  }

  return data;
}

// ============================================================================
// Formatting & UI Helpers
// ============================================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffSeconds = Math.floor((now - date) / 1000);

  if (diffSeconds < 60) return 'Just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getAvatarColor(seedString) {
  const colors = ['#1d9bf0', '#0284c7', '#2563eb', '#0f766e', '#4f46e5', '#0369a1'];
  let hash = 0;
  const text = String(seedString || 'user');
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Renders a user avatar image, or a clean color-coded initial circle if no picture exists
 * or if the external URL fails to load.
 */
function renderAvatar(user, size = 'md') {
  const name = (user && (user.name || user.username)) || 'U';
  const initial = escapeHtml(name.charAt(0).toUpperCase());
  const bg = getAvatarColor(user && (user.username || user._id));
  const sizeClass = size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : '';
  const fallbackClass =
    size === 'sm'
      ? 'avatar-fallback-sm'
      : size === 'lg'
        ? 'avatar-fallback-lg'
        : 'avatar-fallback-md';

  if (user && user.profilePicture) {
    const safeUrl = escapeHtml(user.profilePicture);
    const safeAlt = escapeHtml(`${name}'s avatar`);
    return `
      <img
        src="${safeUrl}"
        alt="${safeAlt}"
        class="avatar ${sizeClass}"
        referrerpolicy="no-referrer"
        onerror="this.outerHTML='<div class=&quot;avatar-fallback ${fallbackClass}&quot; style=&quot;background:${bg}&quot;>${initial}</div>'"
      />
    `;
  }

  return `<div class="avatar-fallback ${fallbackClass}" style="background:${bg}">${initial}</div>`;
}

function updateCharCounter(textarea, counterEl) {
  const length = textarea.value.length;
  counterEl.textContent = `${length} / 280`;
  counterEl.classList.remove('warning', 'limit');
  if (length >= 280) {
    counterEl.classList.add('limit');
  } else if (length >= 245) {
    counterEl.classList.add('warning');
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

function setupModalListeners() {
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal(btn.getAttribute('data-close-modal'));
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        backdrop.classList.add('hidden');
      }
    });
  });
}

// ============================================================================
// Shared Sidebar & Suggested Users
// ============================================================================

function renderSidebarUser() {
  const currentUser = getCurrentUser();
  const container = document.getElementById('sidebarUserCard');
  if (!container || !currentUser) return;

  container.innerHTML = `
    <a href="profile.html?id=${encodeURIComponent(currentUser._id)}" class="sidebar-user-inner">
      <div class="avatar-slot">${renderAvatar(currentUser, 'sm')}</div>
      <div class="sidebar-user-text">
        <span class="sidebar-user-name">${escapeHtml(currentUser.name)}</span>
        <span class="sidebar-user-handle">@${escapeHtml(currentUser.username)}</span>
      </div>
    </a>
  `;

  const navProfileLink = document.getElementById('navProfileLink');
  if (navProfileLink) {
    navProfileLink.href = `profile.html?id=${encodeURIComponent(currentUser._id)}`;
  }
}

async function loadSuggestedUsers(onFollowChange) {
  const container = document.getElementById('suggestedUsersList');
  if (!container) return;

  try {
    const users = await apiFetch('/users/suggested');
    const currentUser = getCurrentUser();
    const followingIds = new Set((currentUser.following || []).map(String));

    if (!users.length) {
      container.innerHTML = '<div class="state-message-sm">No other users to suggest yet.</div>';
      return;
    }

    container.innerHTML = users
      .map((user) => {
        const isFollowing = followingIds.has(String(user._id));
        return `
          <div class="suggested-user-row">
            <a href="profile.html?id=${encodeURIComponent(user._id)}" class="suggested-user-link">
              <div class="avatar-slot">${renderAvatar(user, 'sm')}</div>
              <div class="suggested-user-info">
                <span class="suggested-user-name">${escapeHtml(user.name)}</span>
                <span class="suggested-user-handle">@${escapeHtml(user.username)}</span>
              </div>
            </a>
            <button
              type="button"
              class="btn-follow ${isFollowing ? 'following' : ''}"
              data-follow-user="${escapeHtml(user._id)}"
              data-following="${isFollowing}"
            >
              ${isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll('[data-follow-user]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetId = btn.getAttribute('data-follow-user');
        const currentlyFollowing = btn.getAttribute('data-following') === 'true';
        btn.disabled = true;

        try {
          const endpoint = currentlyFollowing
            ? `/users/${targetId}/unfollow`
            : `/users/${targetId}/follow`;
          const res = await apiFetch(endpoint, { method: 'POST' });

          // Update stored user's following list
          const latestUser = getCurrentUser();
          latestUser.following = res.following;
          updateStoredUser(latestUser);

          const nextState = !currentlyFollowing;
          btn.setAttribute('data-following', String(nextState));
          btn.textContent = nextState ? 'Following' : 'Follow';
          btn.classList.toggle('following', nextState);

          if (typeof onFollowChange === 'function') {
            onFollowChange();
          }
        } catch (error) {
          console.error('Follow toggle error:', error.message);
        } finally {
          btn.disabled = false;
        }
      });
    });
  } catch (error) {
    container.innerHTML = `<div class="state-message-sm">${escapeHtml(error.message)}</div>`;
  }
}

// ============================================================================
// Post Rendering & Actions (Shared by Home Feed & Profile Page)
// ============================================================================

function renderPostsList(container, posts, emptyMessage, onRefreshNeeded) {
  const currentUser = getCurrentUser();

  if (!posts.length) {
    container.innerHTML = `<div class="state-message">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  container.innerHTML = posts
    .map((post) => {
      const author = post.user || {};
      const isOwner = currentUser && String(author._id) === String(currentUser._id);
      const likesArray = Array.isArray(post.likes) ? post.likes.map(String) : [];
      const isLiked = currentUser && likesArray.includes(String(currentUser._id));

      return `
        <article class="post-card" data-post-id="${escapeHtml(post._id)}">
          <a href="profile.html?id=${encodeURIComponent(author._id || '')}" class="avatar-slot">
            ${renderAvatar(author, 'md')}
          </a>
          <div class="post-body">
            <div class="post-header">
              <div class="post-author-meta">
                <a href="profile.html?id=${encodeURIComponent(author._id || '')}" class="post-author-name">
                  ${escapeHtml(author.name || 'Unknown')}
                </a>
                <span class="post-author-username">@${escapeHtml(author.username || 'user')}</span>
                <span class="post-separator" aria-hidden="true">&middot;</span>
                <time class="post-date" datetime="${escapeHtml(post.createdAt)}">
                  ${escapeHtml(formatDate(post.createdAt))}
                </time>
              </div>
            </div>

            <p class="post-content">${escapeHtml(post.content)}</p>

            <div class="post-actions">
              <button
                type="button"
                class="action-btn action-like ${isLiked ? 'liked' : ''}"
                data-like-post="${escapeHtml(post._id)}"
                aria-label="Like post"
              >
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                <span class="like-count">${likesArray.length}</span>
              </button>

              ${
                isOwner
                  ? `
                <div class="post-owner-actions">
                  <button
                    type="button"
                    class="action-btn action-edit"
                    data-edit-post="${escapeHtml(post._id)}"
                    data-edit-content="${escapeHtml(post.content)}"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="action-btn action-delete"
                    data-delete-post="${escapeHtml(post._id)}"
                  >
                    Delete
                  </button>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  // Attach Like handlers
  container.querySelectorAll('[data-like-post]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const postId = btn.getAttribute('data-like-post');
      btn.disabled = true;
      try {
        const result = await apiFetch(`/posts/${postId}/like`, { method: 'POST' });
        btn.classList.toggle('liked', result.liked);
        const countEl = btn.querySelector('.like-count');
        if (countEl) countEl.textContent = result.likesCount;
      } catch (error) {
        console.error('Like error:', error.message);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Attach Edit handlers
  container.querySelectorAll('[data-edit-post]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const postId = btn.getAttribute('data-edit-post');
      const content = btn.getAttribute('data-edit-content');
      const idInput = document.getElementById('editPostId');
      const textarea = document.getElementById('editPostContent');
      const counter = document.getElementById('editCharCounter');
      const errEl = document.getElementById('editPostError');

      if (idInput && textarea && counter) {
        idInput.value = postId;
        textarea.value = content;
        updateCharCounter(textarea, counter);
        if (errEl) errEl.textContent = '';
        openModal('editPostModal');
        textarea.focus();
      }
    });
  });

  // Attach Delete handlers
  container.querySelectorAll('[data-delete-post]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const postId = btn.getAttribute('data-delete-post');
      const deleteIdInput = document.getElementById('deletePostId');
      if (deleteIdInput) {
        deleteIdInput.value = postId;
        openModal('deletePostModal');
      }
    });
  });

  // Setup modal submit handlers once
  setupPostActionModals(onRefreshNeeded);
}

let postModalsInitialized = false;
let currentRefreshCallback = null;

function setupPostActionModals(onRefreshNeeded) {
  currentRefreshCallback = onRefreshNeeded;
  if (postModalsInitialized) return;
  postModalsInitialized = true;

  const editTextarea = document.getElementById('editPostContent');
  const editCounter = document.getElementById('editCharCounter');
  const editForm = document.getElementById('editPostForm');
  const editError = document.getElementById('editPostError');

  if (editTextarea && editCounter) {
    editTextarea.addEventListener('input', () => updateCharCounter(editTextarea, editCounter));
  }

  if (editForm) {
    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const postId = document.getElementById('editPostId').value;
      const content = editTextarea.value.trim();

      if (!content) {
        editError.textContent = 'Post content cannot be empty.';
        return;
      }

      try {
        await apiFetch(`/posts/${postId}`, {
          method: 'PUT',
          body: JSON.stringify({ content }),
        });
        closeModal('editPostModal');
        if (typeof currentRefreshCallback === 'function') {
          await currentRefreshCallback();
        }
      } catch (error) {
        editError.textContent = error.message;
      }
    });
  }

  const confirmDeleteBtn = document.getElementById('confirmDeletePostBtn');
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
      const postId = document.getElementById('deletePostId').value;
      confirmDeleteBtn.disabled = true;
      try {
        await apiFetch(`/posts/${postId}`, { method: 'DELETE' });
        closeModal('deletePostModal');
        if (typeof currentRefreshCallback === 'function') {
          await currentRefreshCallback();
        }
      } catch (error) {
        console.error('Delete post error:', error.message);
      } finally {
        confirmDeleteBtn.disabled = false;
      }
    });
  }
}

// ============================================================================
// Page Controllers
// ============================================================================

function initLoginPage() {
  if (getToken()) {
    window.location.href = 'index.html';
    return;
  }

  const form = document.getElementById('loginForm');
  const errorBox = document.getElementById('authError');
  const submitBtn = document.getElementById('loginSubmitBtn');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveSession(data.token, data.user);
      window.location.href = 'index.html';
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });
}

function initRegisterPage() {
  if (getToken()) {
    window.location.href = 'index.html';
    return;
  }

  const form = document.getElementById('registerForm');
  const errorBox = document.getElementById('authError');
  const submitBtn = document.getElementById('registerSubmitBtn');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    const name = document.getElementById('regName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, username, email, password }),
      });
      saveSession(data.token, data.user);
      window.location.href = 'index.html';
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  });
}

async function initHomePage() {
  if (!getToken() || !getCurrentUser()) {
    window.location.href = 'login.html';
    return;
  }

  renderSidebarUser();
  setupModalListeners();

  const currentUser = getCurrentUser();
  const composerAvatar = document.getElementById('composerAvatar');
  if (composerAvatar) {
    composerAvatar.innerHTML = renderAvatar(currentUser, 'md');
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  const feedContainer = document.getElementById('feedContainer');
  const postTextarea = document.getElementById('postContent');
  const charCounter = document.getElementById('charCounter');
  const composerError = document.getElementById('composerError');
  const createPostForm = document.getElementById('createPostForm');
  const publishBtn = document.getElementById('publishPostBtn');
  const refreshBtn = document.getElementById('refreshFeedBtn');

  async function loadFeed() {
    try {
      const posts = await apiFetch('/posts/feed');
      renderPostsList(
        feedContainer,
        posts,
        'Your feed is empty. Write a post above or follow someone on the right!',
        loadFeed
      );
    } catch (error) {
      feedContainer.innerHTML = `<div class="state-message">${escapeHtml(error.message)}</div>`;
    }
  }

  if (postTextarea && charCounter) {
    postTextarea.addEventListener('input', () => {
      updateCharCounter(postTextarea, charCounter);
      composerError.textContent = '';
    });
  }

  if (createPostForm) {
    createPostForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      composerError.textContent = '';
      const content = postTextarea.value.trim();

      if (!content) {
        composerError.textContent = 'Please write something before posting.';
        return;
      }

      if (content.length > 280) {
        composerError.textContent = 'Post cannot exceed 280 characters.';
        return;
      }

      publishBtn.disabled = true;
      publishBtn.textContent = 'Posting...';

      try {
        await apiFetch('/posts', {
          method: 'POST',
          body: JSON.stringify({ content }),
        });
        postTextarea.value = '';
        updateCharCounter(postTextarea, charCounter);
        await loadFeed();
      } catch (error) {
        composerError.textContent = error.message;
      } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = 'Post';
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadFeed);
  }

  await Promise.all([loadFeed(), loadSuggestedUsers(loadFeed)]);
}

async function initProfilePage() {
  if (!getToken() || !getCurrentUser()) {
    window.location.href = 'login.html';
    return;
  }

  renderSidebarUser();
  setupModalListeners();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  const params = new URLSearchParams(window.location.search);
  const currentUser = getCurrentUser();
  const profileUserId = params.get('id') || currentUser._id;

  const profileCard = document.getElementById('profileCard');
  const profilePostsList = document.getElementById('profilePostsList');
  const headerName = document.getElementById('profileHeaderName');
  const headerPostCount = document.getElementById('profilePostCount');

  async function loadProfile() {
    try {
      const data = await apiFetch(`/users/${profileUserId}`);
      const user = data.user;
      const posts = data.posts || [];
      const latestSessionUser = getCurrentUser();
      const isOwnProfile = String(user._id) === String(latestSessionUser._id);

      // Keep local storage synced if viewing own profile
      if (isOwnProfile) {
        updateStoredUser(user);
        renderSidebarUser();
      }

      headerName.textContent = user.name;
      headerPostCount.textContent = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`;

      const isFollowing = (latestSessionUser.following || [])
        .map(String)
        .includes(String(user._id));

      const joinedDate = new Date(user.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });

      profileCard.innerHTML = `
        <div class="profile-banner"></div>
        <div class="profile-details">
          <div class="profile-top-row">
            <div class="avatar-slot">${renderAvatar(user, 'lg')}</div>
            ${
              isOwnProfile
                ? `<button type="button" class="btn-secondary" id="openEditProfileBtn">Edit Profile</button>`
                : `<button type="button" class="btn-follow ${isFollowing ? 'following' : ''}" id="profileFollowBtn" data-following="${isFollowing}">
                    ${isFollowing ? 'Following' : 'Follow'}
                  </button>`
            }
          </div>

          <h2 class="profile-name">${escapeHtml(user.name)}</h2>
          <div class="profile-handle">@${escapeHtml(user.username)}</div>

          ${user.bio ? `<p class="profile-bio">${escapeHtml(user.bio)}</p>` : ''}

          <div class="profile-meta-line">Joined ${escapeHtml(joinedDate)}</div>

          <div class="profile-stats">
            <button type="button" class="stat-btn" id="openFollowingBtn">
              <span class="stat-count">${(user.following || []).length}</span>
              <span class="stat-label">Following</span>
            </button>
            <button type="button" class="stat-btn" id="openFollowersBtn">
              <span class="stat-count" id="profileFollowersCount">${(user.followers || []).length}</span>
              <span class="stat-label">Followers</span>
            </button>
          </div>
        </div>
      `;

      // Wire Edit Profile button
      const editProfileBtn = document.getElementById('openEditProfileBtn');
      if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
          document.getElementById('editProfileName').value = user.name || '';
          document.getElementById('editProfileUsername').value = user.username || '';
          document.getElementById('editProfileBio').value = user.bio || '';
          document.getElementById('editProfilePicture').value = user.profilePicture || '';
          document.getElementById('editProfileError').textContent = '';
          openModal('editProfileModal');
        });
      }

      // Wire Follow/Unfollow button on another user's profile
      const profileFollowBtn = document.getElementById('profileFollowBtn');
      if (profileFollowBtn) {
        profileFollowBtn.addEventListener('click', async () => {
          const currentlyFollowing =
            profileFollowBtn.getAttribute('data-following') === 'true';
          profileFollowBtn.disabled = true;

          try {
            const endpoint = currentlyFollowing
              ? `/users/${user._id}/unfollow`
              : `/users/${user._id}/follow`;
            const res = await apiFetch(endpoint, { method: 'POST' });

            const stored = getCurrentUser();
            stored.following = res.following;
            updateStoredUser(stored);

            const nextState = !currentlyFollowing;
            profileFollowBtn.setAttribute('data-following', String(nextState));
            profileFollowBtn.textContent = nextState ? 'Following' : 'Follow';
            profileFollowBtn.classList.toggle('following', nextState);

            const countEl = document.getElementById('profileFollowersCount');
            if (countEl) countEl.textContent = res.targetFollowersCount;

            loadSuggestedUsers(loadProfile);
          } catch (error) {
            console.error('Follow error:', error.message);
          } finally {
            profileFollowBtn.disabled = false;
          }
        });
      }

      // Wire Followers & Following list modals
      document.getElementById('openFollowersBtn').addEventListener('click', () => {
        openConnectionsModal(user._id, 'followers', 'Followers');
      });

      document.getElementById('openFollowingBtn').addEventListener('click', () => {
        openConnectionsModal(user._id, 'following', 'Following');
      });

      // Render user's posts
      renderPostsList(
        profilePostsList,
        posts,
        isOwnProfile ? "You haven't posted anything yet." : 'This user has not posted yet.',
        loadProfile
      );
    } catch (error) {
      profileCard.innerHTML = `<div class="state-message">${escapeHtml(error.message)}</div>`;
      profilePostsList.innerHTML = '';
    }
  }

  // Handle Edit Profile form submission
  const editProfileForm = document.getElementById('editProfileForm');
  if (editProfileForm) {
    editProfileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errEl = document.getElementById('editProfileError');
      errEl.textContent = '';

      const name = document.getElementById('editProfileName').value.trim();
      const username = document.getElementById('editProfileUsername').value.trim();
      const bio = document.getElementById('editProfileBio').value.trim();
      const profilePicture = document.getElementById('editProfilePicture').value.trim();

      try {
        const updatedUser = await apiFetch('/users/profile', {
          method: 'PUT',
          body: JSON.stringify({ name, username, bio, profilePicture }),
        });
        updateStoredUser(updatedUser);
        closeModal('editProfileModal');
        await loadProfile();
      } catch (error) {
        errEl.textContent = error.message;
      }
    });
  }

  async function openConnectionsModal(userId, type, title) {
    const titleEl = document.getElementById('connectionsModalTitle');
    const bodyEl = document.getElementById('connectionsModalBody');
    titleEl.textContent = title;
    bodyEl.innerHTML = '<div class="state-message-sm">Loading...</div>';
    openModal('connectionsModal');

    try {
      const users = await apiFetch(`/users/${userId}/${type}`);
      if (!users.length) {
        bodyEl.innerHTML = `<div class="state-message-sm">No ${type} yet.</div>`;
        return;
      }

      bodyEl.innerHTML = users
        .map(
          (u) => `
          <a href="profile.html?id=${encodeURIComponent(u._id)}" class="suggested-user-link">
            <div class="avatar-slot">${renderAvatar(u, 'sm')}</div>
            <div class="suggested-user-info">
              <span class="suggested-user-name">${escapeHtml(u.name)}</span>
              <span class="suggested-user-handle">@${escapeHtml(u.username)}</span>
            </div>
          </a>
        `
        )
        .join('');
    } catch (error) {
      bodyEl.innerHTML = `<div class="state-message-sm">${escapeHtml(error.message)}</div>`;
    }
  }

  await Promise.all([loadProfile(), loadSuggestedUsers(loadProfile)]);
}

// ============================================================================
// Bootstrap Application Based on Current HTML Page
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.getAttribute('data-page');

  if (page === 'login') {
    initLoginPage();
  } else if (page === 'register') {
    initRegisterPage();
  } else if (page === 'home') {
    initHomePage();
  } else if (page === 'profile') {
    initProfilePage();
  }
});
