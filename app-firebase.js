/* ============================================================
   CIS CONNECT — app.js  (version Firebase)
   ============================================================ */

'use strict';

/* ─────────────────────────────────────────────────────────────
   ██████╗  CONFIGURATION FIREBASE
   ▼▼▼ COLLER ICI VOS CLÉS FIREBASE (étape 3 du guide) ▼▼▼
───────────────────────────────────────────────────────────── */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDSl2hKSmnWwcOM4dC1eU_TN62CpUMkxfs",
  authDomain:        "cs-connect-d5c27.firebaseapp.com",
  projectId:         "cs-connect-d5c27",
  storageBucket:     "cs-connect-d5c27.firebasestorage.app",
  messagingSenderId: "981804326594",
  appId:             "1:981804326594:web:c0baebdb0cd88c5612255b"
};

/* ─────────────────────────────────────────────────────────────
   INITIALISATION FIREBASE
───────────────────────────────────────────────────────────── */
import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc,
         onSnapshot, addDoc, setDoc,
         deleteDoc, query, orderBy,
         serverTimestamp }                        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const db          = getFirestore(firebaseApp);
const auth        = getAuth(firebaseApp);

/* ─────────────────────────────────────────────────────────────
   DONNÉES LOCALES (statiques — ne changent pas en temps réel)
───────────────────────────────────────────────────────────── */

const VEHICLES = [
  { name: 'VSAV 1', icon: '🚑', dispo: true },
  { name: 'VSAV 2', icon: '🚑', dispo: true },
  { name: 'VTUTP',  icon: '🚒', dispo: false, motif: 'Révision périodique' },
  { name: 'VTP',    icon: '🚒', dispo: true },
  { name: 'FPT',    icon: '🚒', dispo: false, motif: 'Défaut radio' },
  { name: 'EPA',    icon: '🚒', dispo: true },
  { name: 'VSR',    icon: '🚒', dispo: true },
  { name: 'CCF',    icon: '🚒', dispo: true },
  { name: 'VLTC',   icon: '🚗', dispo: true },
];

const ALL_ROLES = [
  'SPV', 'Formateur', 'Mécanicien', 'Chef de centre', 'Adjoint Chef de centre',
  'Chef de Garde 1', 'Chef de Garde 2', 'Chef de Garde 3', 'Chef de Garde 4', 'Chef de Garde 5',
  'FDF 1', 'FDF 2', 'FDF 3', 'Responsable FDF', 'Référant Note Interne',
  'Garde 1', 'Garde 2', 'Garde 3', 'Garde 4', 'Garde 5', 'Admin',
];

const ROLE_STYLES = {
  'SPV':                    { bg: 'rgba(192,39,45,0.2)',    color: '#E03030' },
  'Admin':                  { bg: 'rgba(241,196,15,0.2)',   color: '#F1C40F' },
  'Formateur':              { bg: 'rgba(39,174,96,0.2)',    color: '#27AE60' },
  'Mécanicien':             { bg: 'rgba(136,136,136,0.2)',  color: '#888'    },
  'Chef de centre':         { bg: 'rgba(52,152,219,0.2)',   color: '#3498DB' },
  'Adjoint Chef de centre': { bg: 'rgba(52,152,219,0.15)',  color: '#5DADE2' },
  'Chef de Garde':          { bg: 'rgba(230,126,34,0.2)',   color: '#E67E22' },
  'FDF':                    { bg: 'rgba(155,89,182,0.2)',   color: '#9B59B6' },
  'Responsable FDF':        { bg: 'rgba(155,89,182,0.25)', color: '#BB8FCE' },
  'Référant Note Interne':  { bg: 'rgba(52,152,219,0.15)', color: '#7FB3D3' },
  'Garde':                  { bg: 'rgba(39,174,96,0.15)',   color: '#58D68D' },
  'default':                { bg: 'rgba(100,100,100,0.2)',  color: '#aaa'    },
};

/* ─────────────────────────────────────────────────────────────
   ÉTAT LOCAL (mis à jour par Firebase en temps réel)
───────────────────────────────────────────────────────────── */

let actus      = [];   // synchronisé depuis Firebase
let formations = [];   // synchronisé depuis Firebase
let users      = [];   // synchronisé depuis Firebase
let annuaire   = [];   // synchronisé depuis Firebase

let currentUser       = null;   // utilisateur connecté
let currentEditId     = null;
let deleteTargetId    = null;
let activeRoleFilter  = 'Tous';
let activeSearchFilter = '';

/* FDF */
let fdfCurrentWeekOffset = 0;
const fdfMyDispos = {};
let fdfOtherAgents = [];   // synchronisé depuis Firebase

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRoleStyle(role) {
  if (ROLE_STYLES[role]) return ROLE_STYLES[role];
  for (const key of Object.keys(ROLE_STYLES)) {
    if (key !== 'default' && role.startsWith(key)) return ROLE_STYLES[key];
  }
  return ROLE_STYLES['default'];
}

function roleBadgeHTML(role) {
  const s = getRoleStyle(role);
  return `<span class="user-card-role" style="background:${s.bg};color:${s.color}">${role}</span>`;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function timeAgo(ts) {
  if (!ts) return 'À l\'instant';
  const diff = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (diff < 60)   return 'À l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return 'Hier';
}

/* ─────────────────────────────────────────────────────────────
   AUTHENTIFICATION FIREBASE
───────────────────────────────────────────────────────────── */

onAuthStateChanged(auth, fbUser => {
  if (fbUser) {
    /* Trouver l'utilisateur dans notre liste */
    const found = users.find(u => u.email === fbUser.email);
    currentUser = found || { prenom: fbUser.email, nom: '', grade: '', roles: [], emoji: '👤', color: '#C0272D' };
    showScreen('dashScreen');
    showToast(`✅ Connecté — Bienvenue ${currentUser.prenom} ${currentUser.nom}`);
  } else {
    showScreen('loginScreen');
  }
});

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  if (!email || !pass) { showToast('⚠️ Veuillez remplir email et mot de passe'); return; }

  showToast('⏳ Connexion en cours...');
  signInWithEmailAndPassword(auth, email, pass)
    .catch(err => {
      const msgs = {
        'auth/user-not-found':  '❌ Email inconnu',
        'auth/wrong-password':  '❌ Mot de passe incorrect',
        'auth/invalid-email':   '❌ Email invalide',
        'auth/too-many-requests': '⚠️ Trop de tentatives, réessayez plus tard',
      };
      showToast(msgs[err.code] || '❌ Erreur de connexion');
    });
}

function doLogout() {
  signOut(auth);
  showToast('👋 Déconnexion réussie');
}

/* ─────────────────────────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────────────────────────── */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);

  if (id === 'actuScreen')      renderActus();
  if (id === 'formationScreen') renderFormations();
  if (id === 'userMgmtScreen')  renderUsers();
  if (id === 'annuaireScreen')  renderAnnuaire();
  if (id === 'fdfScreen')       { fdfRenderMyRow(); fdfUpdateStatus(); }
}

/* ─────────────────────────────────────────────────────────────
   NOTIFICATIONS
───────────────────────────────────────────────────────────── */

function toggleNotifs() {
  document.getElementById('notifPanel').classList.toggle('open');
}

function markRead(el) {
  el.classList.remove('unread');
  const dot = el.querySelector('.notif-dot');
  if (dot) dot.remove();
  const count = document.querySelectorAll('#notifPanel .notif-item.unread').length;
  document.querySelectorAll('.notif-badge').forEach(b => {
    b.textContent   = count;
    b.style.display = count > 0 ? 'flex' : 'none';
  });
}

/* ─────────────────────────────────────────────────────────────
   ACTUALITÉS  ← Firebase Firestore (collection "actus")
───────────────────────────────────────────────────────────── */

const ACTU_TYPE_CONFIG = {
  event:     { label: 'Événement',         css: 'tag-event'     },
  formation: { label: 'Formation',         css: 'tag-formation' },
  alert:     { label: '⚠️ Alerte urgente', css: 'tag-alert'     },
};

/* Écoute en temps réel : dès qu'une actu est ajoutée/modifiée
   tous les utilisateurs connectés voient la mise à jour */
function listenActus() {
  const q = query(collection(db, 'actus'), orderBy('createdAt', 'desc'));
  onSnapshot(q, snap => {
    actus = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderActus();
    /* Badge notif */
    const count = snap.docChanges().filter(c => c.type === 'added').length;
    if (count > 0) {
      document.querySelectorAll('.notif-badge').forEach(b => {
        const cur = parseInt(b.textContent || '0', 10);
        b.textContent   = cur + count;
        b.style.display = 'flex';
      });
    }
  });
}

function renderActus() {
  const list = document.getElementById('actuList');
  if (!list) return;
  if (actus.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text2);padding:40px">Aucune actualité</div>';
    return;
  }
  list.innerHTML = actus.map(a => {
    const t = ACTU_TYPE_CONFIG[a.type] || ACTU_TYPE_CONFIG.event;
    const fileHTML = a.fichier
      ? `<div class="actu-file" onclick="showToast('📄 Ouverture de ${escapeHTML(a.fichier)}')">
           <span class="actu-file-icon">📄</span>
           <span class="actu-file-name">${escapeHTML(a.fichier)}</span>
           <span class="btn-voir">Voir PDF</span>
         </div>`
      : '';
    return `
      <div class="actu-card">
        <div class="actu-card-header">
          <div class="actu-avatar" style="background:${a.color}">${a.initiale}</div>
          <div>
            <div class="actu-author">${a.auteur}</div>
            <div class="actu-role">${a.role}</div>
          </div>
          <div class="actu-time">${timeAgo(a.createdAt)}</div>
        </div>
        <span class="actu-tag ${t.css}">${t.label}</span>
        <div class="actu-title" ${a.type === 'alert' ? 'style="color:var(--red-light)"' : ''}>${a.titre}</div>
        <div class="actu-body">${a.corps}</div>
        ${fileHTML}
      </div>`;
  }).join('') + '<div class="spacer-sm"></div>';
}

function openPublishModal() {
  document.getElementById('pubTitle').value            = '';
  document.getElementById('pubBody').value             = '';
  document.getElementById('pubType').value             = 'event';
  document.getElementById('pubHasFile').checked        = false;
  document.getElementById('pubFileName').style.display = 'none';
  document.getElementById('pubFileName').value         = '';
  document.getElementById('publishModal').classList.add('open');
}

async function publishActu() {
  const titre    = document.getElementById('pubTitle').value.trim();
  const corps    = document.getElementById('pubBody').value.trim();
  const type     = document.getElementById('pubType').value;
  const hasFile  = document.getElementById('pubHasFile').checked;
  const fileName = document.getElementById('pubFileName').value.trim();

  if (!titre) { showToast('⚠️ Le titre est requis !'); return; }
  if (!corps)  { showToast('⚠️ Le contenu est requis !'); return; }

  const u = currentUser || {};
  try {
    await addDoc(collection(db, 'actus'), {
      auteur:   `${u.grade ? u.grade + '. ' : ''}${u.prenom} ${u.nom}`.trim(),
      role:     (u.roles || ['SPV'])[0],
      initiale: (u.prenom || 'X')[0].toUpperCase(),
      color:    u.color || '#C0272D',
      type, titre, corps,
      fichier:  hasFile && fileName ? fileName : null,
      createdAt: serverTimestamp(),
    });
    closeModal('publishModal');
    showToast('📢 Publication envoyée à toute la garde !');
  } catch (e) {
    showToast('❌ Erreur lors de la publication');
    console.error(e);
  }
}

/* ─────────────────────────────────────────────────────────────
   FDF – DISPONIBILITÉS  ← Firebase (collection "fdf_dispos")
───────────────────────────────────────────────────────────── */

let fdfUnsubscribe = null;

function fdfGetWeekStart(offset) {
  const d   = new Date();
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function fdfFormatWeekLabel(offset) {
  const mon = fdfGetWeekStart(offset);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const o   = { day: 'numeric', month: 'short' };
  return 'Sem. du ' + mon.toLocaleDateString('fr-FR', o) + ' – ' + sun.toLocaleDateString('fr-FR', o);
}

function fdfGetWeekKey(offset) {
  const mon = fdfGetWeekStart(offset);
  return mon.toISOString().split('T')[0];   // ex: "2025-04-21"
}

function fdfGetMyDispos(offset) {
  if (!fdfMyDispos[offset]) fdfMyDispos[offset] = [null, null, null, null, null, null, null];
  return fdfMyDispos[offset];
}

function fdfUpdateWeekLabels() {
  const lbl = fdfFormatWeekLabel(fdfCurrentWeekOffset);
  ['fdfWeekLabel', 'fdfWeekLabel2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = lbl;
  });
}

function fdfRenderMyRow() {
  const row = document.getElementById('fdfMyRow');
  if (!row) return;
  fdfUpdateWeekLabels();
  const dispos = fdfGetMyDispos(fdfCurrentWeekOffset);
  row.innerHTML =
    '<div class="fdf-name" style="font-weight:800;font-size:13px">Moi</div>' +
    dispos.map((d, i) => {
      const cls = d === true ? 'dispo' : d === false ? 'indispo' : 'unset';
      const txt = d === true ? '✓'     : d === false ? '✗'       : '?';
      return `<div class="fdf-cell ${cls}" onclick="fdfToggleDay(${i})">${txt}</div>`;
    }).join('');
}

function fdfToggleDay(i) {
  const d = fdfGetMyDispos(fdfCurrentWeekOffset);
  if (d[i] === null)      d[i] = true;
  else if (d[i] === true) d[i] = false;
  else                    d[i] = null;
  fdfRenderMyRow();
  fdfUpdateStatus();
}

function fdfSetWeek(isDispo) {
  const d = fdfGetMyDispos(fdfCurrentWeekOffset);
  for (let i = 0; i < 7; i++) d[i] = isDispo;
  fdfRenderMyRow();
  fdfUpdateStatus();
  showToast(isDispo ? '✅ Semaine entière : Disponible' : '❌ Semaine entière : Indisponible');
}

function fdfUpdateStatus() {
  const d   = fdfGetMyDispos(fdfCurrentWeekOffset);
  const set = d.filter(x => x !== null).length;
  const status = document.getElementById('fdfStatusBadge');
  if (status) {
    status.textContent = set + '/7 jours renseignés';
    status.style.color = set === 7 ? 'var(--green)' : 'var(--text2)';
  }
}

async function fdfSaveMyDispos() {
  const d = fdfGetMyDispos(fdfCurrentWeekOffset);
  if (d.some(x => x === null)) { showToast('⚠️ Renseignez tous les jours avant de valider !'); return; }

  const u       = currentUser || {};
  const weekKey = fdfGetWeekKey(fdfCurrentWeekOffset);
  const docId   = `${u.email || 'inconnu'}_${weekKey}`;

  try {
    await setDoc(doc(db, 'fdf_dispos', docId), {
      nom:     `${u.prenom} ${u.nom}`.trim(),
      email:   u.email || '',
      week:    weekKey,
      dispos:  d,
      statut:  'attente',
      updatedAt: serverTimestamp(),
    });
    const status = document.getElementById('fdfStatusBadge');
    if (status) { status.textContent = '⏳ En attente de validation'; status.style.color = 'var(--orange)'; }
    showToast('💾 Disponibilités enregistrées — En attente de validation');
  } catch (e) {
    showToast('❌ Erreur d\'enregistrement'); console.error(e);
  }
}

function fdfChangeWeek(dir) {
  fdfCurrentWeekOffset += dir;
  fdfRenderMyRow();
  fdfUpdateStatus();
  const rv = document.getElementById('fdfRespoView');
  if (rv && rv.style.display !== 'none') fdfListenAllDispos();
}

function fdfListenAllDispos() {
  if (fdfUnsubscribe) fdfUnsubscribe();
  const weekKey = fdfGetWeekKey(fdfCurrentWeekOffset);
  fdfUnsubscribe = onSnapshot(
    query(collection(db, 'fdf_dispos')),
    snap => {
      fdfOtherAgents = snap.docs
        .map(d => d.data())
        .filter(d => d.week === weekKey && d.email !== (currentUser?.email || ''));
      fdfRenderAllRows();
    }
  );
}

function fdfRenderAllRows() {
  const container = document.getElementById('fdfAllRows');
  if (!container) return;
  fdfUpdateWeekLabels();

  container.innerHTML = fdfOtherAgents.map((agent, idx) => {
    const sc      = agent.statut;
    const scColor = sc === 'valide' ? 'var(--green)' : sc === 'refuse' ? 'var(--red-light)' : 'var(--orange)';
    const scLabel = sc === 'valide' ? '✅ Validé'    : sc === 'refuse' ? '❌ Refusé'         : '⏳ En attente';
    const countD  = (agent.dispos || []).filter(x => x === true).length;
    const cells   = (agent.dispos || []).map(d => `<div class="fdf-cell ${d ? 'dispo' : 'indispo'}">${d ? '✓' : '✗'}</div>`).join('');
    const actionBtns = sc === 'attente'
      ? `<div style="display:flex;gap:8px;margin-top:10px">
           <button onclick="fdfValiderAgent('${agent.email}')" style="flex:1;background:rgba(39,174,96,0.15);border:1px solid rgba(39,174,96,0.35);border-radius:10px;padding:10px;color:var(--green);font-weight:700;font-size:13px;">✅ Valider</button>
           <button onclick="fdfRefuserAgent('${agent.email}')" style="flex:1;background:rgba(192,39,45,0.1);border:1px solid rgba(192,39,45,0.3);border-radius:10px;padding:10px;color:var(--red-light);font-weight:700;font-size:13px;">❌ Refuser</button>
         </div>`
      : `<button onclick="fdfResetAgent('${agent.email}')" style="width:100%;margin-top:8px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:10px;padding:8px;color:var(--text2);font-weight:600;font-size:12px;">↩ Remettre en attente</button>`;

    return `
      <div style="background:var(--gray);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-weight:800;font-size:15px">${agent.nom}</div>
            <div style="font-size:11px;color:var(--text2)">${countD}/7 jours disponibles</div>
          </div>
          <span style="font-size:12px;font-weight:700;color:${scColor}">${scLabel}</span>
        </div>
        <div class="fdf-row" style="margin-bottom:0">
          <div style="font-size:10px;color:var(--text2);display:flex;align-items:center;font-weight:600">Dispos</div>
          ${cells}
        </div>
        ${actionBtns}
      </div>`;
  }).join('') || '<div style="text-align:center;color:var(--text2);padding:20px">Aucun agent pour cette semaine</div>';

  const v = fdfOtherAgents.filter(a => a.statut === 'valide').length;
  const r = fdfOtherAgents.filter(a => a.statut === 'refuse').length;
  const a = fdfOtherAgents.filter(a => a.statut === 'attente').length;
  const cd = document.getElementById('fdfCountDispo');   if (cd) cd.textContent = v;
  const ci = document.getElementById('fdfCountIndispo'); if (ci) ci.textContent = r;
  const cp = document.getElementById('fdfCountPending'); if (cp) cp.textContent = a;
}

async function fdfValiderAgent(email) {
  const weekKey = fdfGetWeekKey(fdfCurrentWeekOffset);
  await setDoc(doc(db, 'fdf_dispos', `${email}_${weekKey}`), { statut: 'valide' }, { merge: true });
  showToast('✅ Agent validé — Notification envoyée !');
}

async function fdfRefuserAgent(email) {
  const weekKey = fdfGetWeekKey(fdfCurrentWeekOffset);
  await setDoc(doc(db, 'fdf_dispos', `${email}_${weekKey}`), { statut: 'refuse' }, { merge: true });
  showToast('❌ Agent refusé — Notification envoyée.');
}

async function fdfResetAgent(email) {
  const weekKey = fdfGetWeekKey(fdfCurrentWeekOffset);
  await setDoc(doc(db, 'fdf_dispos', `${email}_${weekKey}`), { statut: 'attente' }, { merge: true });
  showToast('↩ Agent remis en attente.');
}

async function fdfValiderTous() {
  const pending = fdfOtherAgents.filter(a => a.statut === 'attente');
  if (pending.length === 0) { showToast('ℹ️ Aucun agent en attente.'); return; }
  const weekKey = fdfGetWeekKey(fdfCurrentWeekOffset);
  await Promise.all(pending.map(a =>
    setDoc(doc(db, 'fdf_dispos', `${a.email}_${weekKey}`), { statut: 'valide' }, { merge: true })
  ));
  showToast('✅ ' + pending.length + ' agent(s) validés !');
}

function fdfShowView(view) {
  const mv = document.getElementById('fdfMyView');
  const rv = document.getElementById('fdfRespoView');
  const bm = document.getElementById('fdfBtnMy');
  const br = document.getElementById('fdfBtnRespo');
  const activeStyle   = 'flex:1;background:var(--red);border:none;border-radius:8px;padding:8px;color:white;font-weight:700;font-size:12px;';
  const inactiveStyle = 'flex:1;background:var(--gray);border:1px solid var(--border);border-radius:8px;padding:8px;color:var(--text);font-weight:700;font-size:12px;';

  if (view === 'my') {
    mv.style.display = 'block'; rv.style.display = 'none';
    bm.style.cssText = activeStyle; br.style.cssText = inactiveStyle;
  } else {
    mv.style.display = 'none'; rv.style.display = 'block';
    br.style.cssText = activeStyle; bm.style.cssText = inactiveStyle;
    fdfListenAllDispos();
  }
}

/* ─────────────────────────────────────────────────────────────
   FORMATIONS  ← Firebase (collection "formations")
───────────────────────────────────────────────────────────── */

const FORM_TYPE_MAP   = { suap: 'type-suap', inc: 'type-inc', div: 'type-div' };
const FORM_TYPE_LABEL = { suap: 'SUAP',      inc: 'INC',      div: 'DIV'      };

function listenFormations() {
  const q = query(collection(db, 'formations'), orderBy('createdAt', 'desc'));
  onSnapshot(q, snap => {
    formations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderFormations();
  });
}

function renderFormations() {
  const el = document.getElementById('formationList');
  if (!el) return;
  if (formations.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:var(--text2);padding:40px">Aucune formation enregistrée</div>';
    return;
  }
  el.innerHTML = formations.map(f => `
    <div class="formation-card">
      <div class="formation-header">
        <div>
          <div class="formation-name">${f.nom}</div>
          <div style="font-size:12px;color:var(--text2)">${f.grade}</div>
        </div>
        <span class="formation-type ${FORM_TYPE_MAP[f.type] || 'type-suap'}">${FORM_TYPE_LABEL[f.type] || f.type.toUpperCase()}</span>
      </div>
      <div class="formation-row">
        <span class="formation-tag">📅 ${f.date}</span>
        <span class="formation-tag">Fonction : ${f.fonction}</span>
        <span class="formation-tag">Formateur : ${f.formateur}</span>
      </div>
      <div class="formation-comment">
        <b style="color:var(--green)">✅ Points positifs :</b> ${f.positif}<br>
        <b style="color:var(--orange)">🔧 Axes d'amélioration :</b> ${f.amelio}
      </div>
      <button class="btn-secondary" style="margin-top:12px;font-size:12px;padding:8px 14px" onclick="showToast('📧 Fiche envoyée par email')">📧 Exporter PDF</button>
    </div>`).join('');
}

function openFormationModal() {
  document.getElementById('formDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('formationModal').classList.add('open');
}

async function submitFormation() {
  const positif = document.getElementById('formPositif').value.trim();
  const amelio  = document.getElementById('formAmelio').value.trim();
  if (!positif || !amelio) { showToast('⚠️ Remplissez les points positifs et axes d\'amélioration !'); return; }

  const rawDate        = document.getElementById('formDate').value;
  const dateStr        = rawDate ? new Date(rawDate).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
  const nomPersonnel   = document.getElementById('formPersonnel').value;
  const userFound      = users.find(u => (u.prenom + ' ' + u.nom) === nomPersonnel);
  const gradePersonnel = userFound ? userFound.grade : 'SPV';

  try {
    await addDoc(collection(db, 'formations'), {
      nom:       nomPersonnel,
      grade:     gradePersonnel,
      type:      document.getElementById('formType').value,
      date:      dateStr,
      fonction:  document.getElementById('formFonction').value,
      formateur: document.getElementById('formFormateur').value,
      positif, amelio,
      createdAt: serverTimestamp(),
    });
    closeModal('formationModal');
    showToast('✅ Fiche de formation enregistrée !');
  } catch (e) {
    showToast('❌ Erreur d\'enregistrement'); console.error(e);
  }
}

/* ─────────────────────────────────────────────────────────────
   VÉHICULES
───────────────────────────────────────────────────────────── */

function openProblemModal() {
  document.getElementById('problemDesc').value = '';
  document.getElementById('problemModal').classList.add('open');
}

async function submitProblem() {
  const desc    = document.getElementById('problemDesc').value.trim();
  const vehicle = document.getElementById('problemVehicle').value;
  if (!desc) { showToast('⚠️ Décrivez le problème !'); return; }

  try {
    await addDoc(collection(db, 'problemes'), {
      vehicle, desc,
      signalePar: currentUser ? `${currentUser.prenom} ${currentUser.nom}` : 'Inconnu',
      statut:     'ouvert',
      createdAt:  serverTimestamp(),
    });
    closeModal('problemModal');
    showToast('🔔 Problème signalé et mécanicien notifié !');
  } catch (e) {
    showToast('❌ Erreur lors du signalement'); console.error(e);
  }
}

/* ─────────────────────────────────────────────────────────────
   ANNUAIRE  ← Firebase (collection "annuaire")
───────────────────────────────────────────────────────────── */

function listenAnnuaire() {
  onSnapshot(collection(db, 'annuaire'), snap => {
    annuaire = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAnnuaire();
  });
}

function renderAnnuaire(filter = '') {
  const el = document.getElementById('annuaireList');
  if (!el) return;
  const lc       = filter.toLowerCase();
  const source   = annuaire.length > 0 ? annuaire : [];
  const filtered = source.filter(p =>
    (p.nom      || '').toLowerCase().includes(lc) ||
    (p.role     || '').toLowerCase().includes(lc) ||
    (p.grade    || '').toLowerCase().includes(lc) ||
    (p.fonction || '').toLowerCase().includes(lc)
  );
  el.innerHTML = filtered.map(p => `
    <div class="annuaire-card" onclick="showToast('📞 ${p.nom} : ${p.tel}')">
      <div class="annuaire-avatar">${(p.init || p.nom[0]).toUpperCase()}</div>
      <div>
        <div class="annuaire-name">${p.nom}</div>
        <div class="annuaire-grade">${p.grade} • ${p.role}</div>
        <div class="annuaire-func">${p.fonction}</div>
      </div>
      <div class="annuaire-contact">
        <div class="annuaire-phone">📱 ${p.tel}</div>
      </div>
    </div>`).join('') || '<div style="text-align:center;color:var(--text2);padding:30px">Aucun résultat</div>';
}

function filterAnnuaire(val) { renderAnnuaire(val); }

/* ─────────────────────────────────────────────────────────────
   GARDE – CHAT  ← Firebase (collection "messages")
───────────────────────────────────────────────────────────── */

function listenChat() {
  const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
  onSnapshot(q, snap => {
    const chat = document.getElementById('gardeChat');
    if (!chat) return;
    /* Vider les messages Firebase (garder les statiques HTML) */
    const fbMsgs = chat.querySelectorAll('.chat-msg.fb');
    fbMsgs.forEach(m => m.remove());

    snap.docs.forEach(d => {
      const data = d.data();
      const isMine = data.email === auth.currentUser?.email;
      const msg = document.createElement('div');
      msg.className = `chat-msg ${isMine ? 'sent' : 'received'} fb`;
      if (!isMine) msg.innerHTML = `<div class="chat-msg-author">${escapeHTML(data.auteur)}</div>`;
      msg.innerHTML += escapeHTML(data.texte) +
        `<div class="chat-time">${data.createdAt ? new Date(data.createdAt.toMillis()).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : ''}</div>`;
      chat.appendChild(msg);
    });
    /* Scroll bas */
    chat.scrollTop = chat.scrollHeight;
  });
}

async function sendGardeMsg() {
  const input = document.getElementById('chatInput');
  const val   = input.value.trim();
  if (!val) return;

  const u = currentUser || {};
  try {
    await addDoc(collection(db, 'messages'), {
      texte:     val,
      auteur:    `${u.prenom} ${u.nom}`.trim() || 'Inconnu',
      email:     auth.currentUser?.email || '',
      createdAt: serverTimestamp(),
    });
    input.value = '';
  } catch (e) {
    showToast('❌ Impossible d\'envoyer le message'); console.error(e);
  }
}

/* ─────────────────────────────────────────────────────────────
   INFOS INTERNES
───────────────────────────────────────────────────────────── */

function filterCat(btn, cat) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  showToast('Filtre : ' + cat);
}

/* ─────────────────────────────────────────────────────────────
   USER MANAGEMENT  ← Firebase (collection "users")
───────────────────────────────────────────────────────────── */

function listenUsers() {
  onSnapshot(collection(db, 'users'), snap => {
    users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUsers();
    /* Mettre à jour currentUser si déjà connecté */
    if (auth.currentUser) {
      const found = users.find(u => u.email === auth.currentUser.email);
      if (found) currentUser = found;
    }
  });
}

function renderUsers() {
  const list = document.getElementById('userCardList');
  if (!list) return;

  const filtered = users.filter(u => {
    const haystack = (u.prenom + ' ' + u.nom + ' ' + (u.roles || []).join(' ') + ' ' + u.grade).toLowerCase();
    const matchSearch = haystack.includes(activeSearchFilter.toLowerCase());
    const matchRole   = activeRoleFilter === 'Tous' || (u.roles || []).some(r => r.includes(activeRoleFilter));
    return matchSearch && matchRole;
  });

  list.innerHTML = filtered.map(u => `
    <div class="user-card">
      <div class="user-card-avatar" style="background:${u.color}">${u.emoji}</div>
      <div class="user-card-info">
        <div class="user-card-name">${u.prenom} ${u.nom}</div>
        <div class="user-card-grade">${u.grade} • ${u.fonction}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">
          ${(u.roles || []).map(r => roleBadgeHTML(r)).join('')}
        </div>
      </div>
      <div class="user-card-actions">
        <button class="btn-icon btn-edit"   onclick="openUserEdit('${u.id}')">✏️</button>
        <button class="btn-icon btn-delete" onclick="askDeleteUser('${u.id}')">🗑️</button>
      </div>
    </div>`).join('') || '<div style="text-align:center;color:var(--text2);padding:30px">Aucun résultat</div>';

  const cnt = users.length;
  const b = document.getElementById('userCountBadge'); if (b) b.textContent = cnt;
  const a = document.getElementById('adminUserCount'); if (a) a.textContent = cnt;
}

function filterUsers(val) { activeSearchFilter = val; renderUsers(); }

function setRoleFilter(el, role) {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  activeRoleFilter = role;
  renderUsers();
}

function openUserEdit(id) {
  currentEditId = id || null;
  document.getElementById('editModalTitle').textContent = id ? "Modifier l'utilisateur" : 'Nouvel utilisateur';

  const u = id ? users.find(x => x.id === id) : null;

  document.getElementById('editPrenom').value   = u?.prenom   ?? '';
  document.getElementById('editNom').value      = u?.nom      ?? '';
  document.getElementById('editEmail').value    = u?.email    ?? '';
  document.getElementById('editTel').value      = u?.tel      ?? '';
  document.getElementById('editGrade').value    = u?.grade    ?? 'Sapeur';
  document.getElementById('editFonction').value = u?.fonction ?? 'EQ';
  document.getElementById('editMedical').value  = u?.medical  ?? '';
  document.getElementById('editPassword').value = '';

  const emoji = u?.emoji ?? '👤';
  const color = u?.color ?? '#C0272D';
  document.getElementById('editAvatarPreview').style.background = color;
  document.getElementById('editAvatarEmoji').textContent = emoji;

  document.querySelectorAll('.avatar-opt').forEach(a => a.classList.toggle('selected', a.dataset.emoji === emoji));
  document.querySelectorAll('.color-opt').forEach(c  => c.classList.toggle('selected', c.dataset.color === color));

  const userRoles = u?.roles ?? [];
  document.getElementById('roleCheckboxes').innerHTML = ALL_ROLES.map(role => {
    const s = getRoleStyle(role);
    return `
      <label class="role-checkbox-item">
        <input type="checkbox" value="${role}" ${userRoles.includes(role) ? 'checked' : ''} onchange="updateRolePreview()">
        <span class="role-checkbox-label">${role}</span>
        <span class="role-badge-mini" style="background:${s.bg};color:${s.color}">${role}</span>
      </label>`;
  }).join('');

  updateRolePreview();
  document.getElementById('editUserModal').classList.add('open');
}

function closeUserEdit() {
  document.getElementById('editUserModal').classList.remove('open');
}

function selectAvatar(el) {
  document.querySelectorAll('.avatar-opt').forEach(a => a.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('editAvatarEmoji').textContent = el.dataset.emoji;
}

function selectColor(el) {
  document.querySelectorAll('.color-opt').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('editAvatarPreview').style.background = el.dataset.color;
}

function updateRolePreview() {
  const checked = Array.from(document.querySelectorAll('#roleCheckboxes input:checked')).map(cb => cb.value);
  const wrap    = document.getElementById('rolePreviewWrap');
  if (!wrap) return;
  wrap.innerHTML = checked.length === 0
    ? '<span style="color:var(--text2);font-size:12px">Aucun rôle sélectionné</span>'
    : checked.map(r => roleBadgeHTML(r)).join('');
}

async function saveUser() {
  const prenom = document.getElementById('editPrenom').value.trim();
  const nom    = document.getElementById('editNom').value.trim();
  if (!prenom || !nom) { showToast('⚠️ Prénom et nom requis !'); return; }

  const roles = Array.from(document.querySelectorAll('#roleCheckboxes input:checked')).map(cb => cb.value);
  if (roles.length === 0) { showToast('⚠️ Sélectionnez au moins un rôle !'); return; }

  const se = document.querySelector('.avatar-opt.selected');
  const sc = document.querySelector('.color-opt.selected');

  const data = {
    prenom, nom,
    email:    document.getElementById('editEmail').value,
    tel:      document.getElementById('editTel').value,
    grade:    document.getElementById('editGrade').value,
    fonction: document.getElementById('editFonction').value,
    roles,
    emoji: se?.dataset.emoji ?? '👤',
    color: sc?.dataset.color ?? '#C0272D',
    medical: document.getElementById('editMedical').value,
    updatedAt: serverTimestamp(),
  };

  try {
    if (currentEditId) {
      await setDoc(doc(db, 'users', currentEditId), data, { merge: true });
      showToast('✅ Utilisateur mis à jour !');
    } else {
      await addDoc(collection(db, 'users'), { ...data, createdAt: serverTimestamp() });
      showToast('✅ Utilisateur ajouté !');
    }
    closeUserEdit();
  } catch (e) {
    showToast('❌ Erreur lors de la sauvegarde'); console.error(e);
  }
}

function askDeleteUser(id) {
  deleteTargetId = id;
  const u = users.find(x => x.id === id);
  document.getElementById('confirmDeleteName').textContent =
    `Supprimer ${u?.prenom} ${u?.nom} ? Cette action est irréversible.`;
  document.getElementById('confirmDelete').classList.add('open');
}

function closeConfirmDelete() {
  document.getElementById('confirmDelete').classList.remove('open');
  deleteTargetId = null;
}

async function confirmDeleteUser() {
  try {
    await deleteDoc(doc(db, 'users', deleteTargetId));
    closeConfirmDelete();
    showToast('🗑️ Utilisateur supprimé.');
  } catch (e) {
    showToast('❌ Erreur lors de la suppression'); console.error(e);
  }
}

/* ─────────────────────────────────────────────────────────────
   MODALS UTILS
───────────────────────────────────────────────────────────── */

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

/* ─────────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  /* Date du jour */
  document.getElementById('dateToday').textContent =
    new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

  /* Inventaire – liste véhicules */
  const vehicleListEl = document.getElementById('vehicleList');
  VEHICLES.forEach(v => {
    vehicleListEl.innerHTML +=
      `<div class="inv-vehicle-card" onclick="showToast('📋 Ouverture inventaire ${v.name}')">
        <div class="inv-left">
          <div class="inv-icon-wrap bg-red">${v.icon}</div>
          <div>
            <div class="inv-name">${v.name}</div>
            <div class="inv-sub">Inventaire véhicule</div>
          </div>
        </div>
        <div class="inv-arrow">›</div>
      </div>`;
  });

  /* Véhicules – synoptique */
  const synEl = document.getElementById('vehicSynoptic');
  VEHICLES.forEach(v => {
    synEl.innerHTML +=
      `<div class="vehicle-status-card">
        <div class="vehicle-status-header">
          <div class="vehicle-status-name">
            <div class="status-dot ${v.dispo ? 'dispo' : 'indispo'}"></div>
            ${v.icon} ${v.name}
          </div>
          <span class="vehicle-status-badge ${v.dispo ? 'badge-dispo' : 'badge-indispo'}">
            ${v.dispo ? 'Disponible' : 'Indisponible'}
          </span>
        </div>
        ${!v.dispo ? `<div class="vehicle-motif">⚠️ ${v.motif}</div>` : ''}
      </div>`;
  });

  /* Lancement des listeners Firebase temps réel */
  listenActus();
  listenFormations();
  listenUsers();
  listenAnnuaire();
  listenChat();

  /* FDF initial */
  fdfRenderMyRow();
  fdfUpdateStatus();

  /* Fermeture modals overlay au clic en dehors */
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
  });

  /* Envoi message garde avec Entrée */
  const chatInput = document.getElementById('chatInput');
  if (chatInput) chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendGardeMsg(); });
});
