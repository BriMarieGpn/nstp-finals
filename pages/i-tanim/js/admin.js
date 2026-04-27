import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, doc, deleteDoc, setDoc, updateDoc, onSnapshot, collection, getDocs, getDoc, query, where, arrayUnion, arrayRemove, addDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
const adminStateDoc = doc(db, 'admin', 'state');
let hasResolvedAuth = false;
let authReadyPromise = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    console.log('[admin.js] Auth state changed:', user ? `${user.email} (uid: ${user.uid})` : 'logged out');
    unsubscribe();
    resolve(user);
  });
});
let realtimeInitialized = false;
const ACTIVE_TAB_KEY = 'growsauyouAdminActiveTab';

const ROLE_CACHE_KEY = 'growsauyouRoleCache';

const defaultImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='280' viewBox='0 0 500 280'%3E%3Crect width='500' height='280' fill='%23546B41'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='24' fill='%23FFF8EC'%3EImage unavailable%3C/text%3E%3C/svg%3E";

function normalizeRole(role) {
    return String(role || '').toLowerCase().trim();
}

function normalizeStatus(status) {
    return String(status || 'pending').toLowerCase().trim();
}

function isAdminEmail(email) {
    const val = String(email || '').toLowerCase();
    return val.includes('admin');
}

function revealApp() {
    document.body.classList.remove('auth-pending');
    // Also directly hide the gate so CSS transitions can't block it
    const gate = document.getElementById('authLoadingGate');
    if (gate) { gate.style.opacity = '0'; gate.style.visibility = 'hidden'; gate.style.pointerEvents = 'none'; }
    const content = document.getElementById('appContent');
    if (content) { content.style.opacity = '1'; content.style.pointerEvents = ''; }
}

function redirectOnce(path) {
    if (hasResolvedAuth) return;
    hasResolvedAuth = true;
    window.location.href = path;
}

function cacheRole(uid, role) {
    try {
        localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ uid, role: normalizeRole(role) }));
    } catch {
        // ignore cache errors
    }
}

function getCachedRole(uid) {
    try {
        const raw = localStorage.getItem(ROLE_CACHE_KEY);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (!cached || cached.uid !== uid) return null;
        return normalizeRole(cached.role);
    } catch {
        return null;
    }
}

function renderAdminShell() {
    const fns = [updateDashboard, updateAnalytics, updateVolunteers, loadRestrictionsUI,
                 updateSkills, updateBadges, updateCertifications, updateNotifications];
    fns.forEach(fn => { try { fn(); } catch(e) { console.warn('renderAdminShell:', fn.name, e); } });
    // Fetch live programs from Firestore on load
    fetchAndRenderPrograms().catch(() => {});
    // Init Firestore realtime listeners once
    if (!realtimeInitialized) {
        realtimeInitialized = true;
        try { initFirestoreAdminState(); } catch(e) { console.warn('initFirestoreAdminState', e); }
        try { loadCertificatesFromFirestore(); } catch(e) { console.warn('loadCertificatesFromFirestore', e); }
    }
    try { initAdminAttachmentPreview(); } catch(e) {}
}

// Data structures
let users = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
let programs = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
let certifications = JSON.parse(localStorage.getItem('itanimCerts') || '[]');
let skills = JSON.parse(localStorage.getItem('itanimSkills') || '[]');
let restrictions = JSON.parse(localStorage.getItem('itanimRestrictions') || '{"minAge":18,"validBarangays":"All"}');
let badgeThresholds = JSON.parse(localStorage.getItem('itanimBadges') || '{"bronze":10,"silver":25,"gold":50,"platinum":100}');
let notifications = JSON.parse(localStorage.getItem('itanimNotifications') || '[]');
const programsKey = "itanimPrograms";

function refreshLocalAdminCache() {
    try {
        const localUsers = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
        const localPrograms = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
        if (Array.isArray(localUsers)) users = localUsers;
        if (Array.isArray(localPrograms)) programs = localPrograms;
    } catch {
        // ignore parse issues, keep current in-memory values
    }
}


// Save functions
async function saveAdminStateToFirestore() {
    if (!useFirestore) return;
    try {
        await setDoc(adminStateDoc, {
            users,
            programs,
            certifications,
            skills,
            restrictions,
            badgeThresholds,
            notifications
        }, { merge: true });
    } catch (err) {
        console.warn('Could not save admin state to Firestore', err);
    }
}

function saveUsers() {
    localStorage.setItem('itanimUsers', JSON.stringify(users));
    saveAdminStateToFirestore();
}
function savePrograms() {
    localStorage.setItem('itanimPrograms', JSON.stringify(programs));
    saveAdminStateToFirestore();
    // Always sync to homepage programs after saving
    syncProgramsFromPrograms();
}
function updateTasks() {
    // Placeholder for task list updates in admin dashboard.
    // If task management is later added, populate or refresh task UI here.
    const taskList = document.getElementById('taskList');
    if (taskList) {
        taskList.innerHTML = '<p>Task list refresh complete.</p>';
    }
}

function syncProgramsFromTasks() {
    // Placeholder mapping for task-sync workflows.
    // This function exists to prevent errors when admin loads and is not currently using task sync.
    return;
}
function saveCerts() {
    localStorage.setItem('itanimCerts', JSON.stringify(certifications));
    
    // Save certificates to Firestore
    if (useFirestore) {
        certifications.forEach(async (cert) => {
            try {
                const certRef = doc(db, 'certificates', cert.id);
                await setDoc(certRef, cert, { merge: true });
            } catch (error) {
                console.warn('Could not save certificate to Firestore:', cert.id, error);
            }
        });
    }
    
    saveAdminStateToFirestore();
}
function saveSkills() {
    localStorage.setItem('itanimSkills', JSON.stringify(skills));
    saveAdminStateToFirestore();
}
function saveRestrictions() {
    localStorage.setItem('itanimRestrictions', JSON.stringify(restrictions));
    saveAdminStateToFirestore();
}
function saveBadges() {
    localStorage.setItem('itanimBadges', JSON.stringify(badgeThresholds));
    saveAdminStateToFirestore();
}
function saveNotifications() {
    localStorage.setItem('itanimNotifications', JSON.stringify(notifications));
    saveAdminStateToFirestore();
}

async function initFirestoreAdminState() {
    if (!useFirestore) {
        console.warn('Firestore is not configured for admin panel. Using local demo data only.');
        return;
    }

    try {
        onSnapshot(adminStateDoc, (snapshot) => {
            if (!snapshot.exists()) {
                console.warn('Firestore admin state document not found. Local data will be used.');
                return;
            }
            const data = snapshot.data();
            if (!data) return;
            users = Array.isArray(data.users) ? data.users : users;
            programs = Array.isArray(data.programs) ? data.programs : programs;
            certifications = Array.isArray(data.certifications) ? data.certifications : certifications;
            skills = Array.isArray(data.skills) ? data.skills : skills;
            restrictions = data.restrictions || restrictions;
            badgeThresholds = data.badgeThresholds || badgeThresholds;
            notifications = Array.isArray(data.notifications) ? data.notifications : notifications;

            // Merge Firestore programs with local cache so newly added local programs
            // are not lost when changing tabs or when snapshots arrive late.
            let localPrograms = [];
            try {
                localPrograms = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
            } catch {
                localPrograms = [];
            }
            const firestorePrograms = Array.isArray(data.programs) ? data.programs : [];
            const mergedProgramsById = new Map();
            firestorePrograms.forEach((p) => mergedProgramsById.set(p.id, p));
            localPrograms.forEach((p) => mergedProgramsById.set(p.id, p));
            programs = Array.from(mergedProgramsById.values()).map(program => ({
                ...program,
                name: program.name || program.title || 'Untitled Program',
                assigned: Array.isArray(program.assigned) ? program.assigned : Array.isArray(program.joined) ? program.joined : [],
                joined: Array.isArray(program.joined) ? program.joined : Array.isArray(program.assigned) ? program.assigned : [],
                maxVolunteers: program.maxVolunteers ?? 0,
                status: program.status || 'active'
            }));
            updateDashboard();
            updateAnalytics();
            updateVolunteers();
            loadRestrictionsUI();
            updateSkills();
            updatePrograms();
            updateBadges();
            updateCertifications();
            updateNotifications();
            syncProgramsFromPrograms();
        });

        // Live-sync volunteers so hours are always reflected in dashboard analytics.
        // Live-sync volunteers so hours are always reflected in dashboard analytics.
        onSnapshot(collection(db, 'volunteers'), (volunteersSnap) => {
            users = [];
            volunteersSnap.forEach((volunteerDoc) => {
                const data = volunteerDoc.data();
                users.push({
                    id: volunteerDoc.id,
                    name: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'Volunteer',
                    email: data.email || '',
                    age: data.age || '',
                    barangay: data.barangay || data.address || '',
                    skills: data.skills || [],
                    status: normalizeStatus(data.status),
                    hours: Number(data.hours || 0),
                    badge: data.badge || 'None',
                    enrolledPrograms: data.enrolledPrograms || [],
                    completedPrograms: data.completedPrograms || [],
                    createdAt: data.createdAt || data.registeredAt || null,
                    pendingValidation: data.pendingValidation || [],
                    absentPrograms: data.absentPrograms || []
                });
            });
            updateVolunteers();
            updateDashboard();
            updateAnalytics();
            updateVolunteerProgramParticipants();
        });
        console.log('Firestore admin state initialized');
    } catch (err) {
        console.warn('Firestore admin state listener failed', err);
    }
}

// Load certificates from Firestore collection
async function loadCertificatesFromFirestore() {
    if (!useFirestore) return;
    
    try {
        const certificatesSnapshot = await getDocs(collection(db, 'certificates'));
        const firestoreCertificates = certificatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Merge with local certificates
        const mergedCertificates = new Map();
        certifications.forEach(cert => mergedCertificates.set(cert.id, cert));
        firestoreCertificates.forEach(cert => mergedCertificates.set(cert.id, cert));
        
        certifications = Array.from(mergedCertificates.values());
        localStorage.setItem('itanimCerts', JSON.stringify(certifications));
        
        console.log('Loaded certificates from Firestore:', certifications.length);
    } catch (error) {
        console.warn('Could not load certificates from Firestore:', error);
    }
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
    });
}

function renderProgramAttachmentPreview(attachments) {
    const container = document.getElementById('programAttachmentPreview');
    if (!container) return;
    if (!Array.isArray(attachments) || attachments.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = attachments.map(att => `
        <div style="border:1px solid rgba(255,255,255,0.18); border-radius:12px; overflow:hidden; background:rgba(255,255,255,0.06);">
            <img src="${att.dataUrl}" alt="${att.name}" style="width:100%; height:86px; object-fit:cover; display:block;">
            <div style="padding:6px 8px; font-size:12px; opacity:0.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${att.name}</div>
        </div>
    `).join('');
}

function renderTaskAttachmentPreview(attachments) {
    // Alias for compatibility with task attachment handling
    renderProgramAttachmentPreview(attachments);
}

async function getAttachmentsFromInput() {
    const input = document.getElementById('programAttachments');
    if (!input || !input.files || input.files.length === 0) return [];
    const files = Array.from(input.files);
    const results = [];
    for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        results.push({ name: file.name, type: file.type, size: file.size, dataUrl });
    }
    return results;
}

function clearAttachmentInput() {
    const input = document.getElementById('programAttachments');
    if (input) input.value = '';
    renderProgramAttachmentPreview([]);
}

async function syncProgramsFromPrograms() {
    // Mirror programs -> public "Available Programs" list (index.js reads this key in offline mode)
    const programDocs = programs.map(p => ({
        id: p.id,
        title: p.name,
        hours: String(p.hours ?? ''),
        requirement: p.requirement || 'None',
        desc: p.desc || '',
        image: (p.attachments && p.attachments[0] && p.attachments[0].dataUrl) ? p.attachments[0].dataUrl : defaultImage,
        joined: p.joined || [],
        skills: p.skills || [],
        _source: 'program'
    }));
    localStorage.setItem(programsKey, JSON.stringify(programs));

    if (!useFirestore) return;

    try {
        // Upsert each program directly into the 'programs' collection by its ID
        const addPromises = programs.map(async (program) => {
            const firestoreData = {
                name: program.name,
                title: program.name,
                hours: program.hours,
                requirement: program.requirement || 'None',
                desc: program.desc || '',
                image: (program.attachments && program.attachments[0] && program.attachments[0].dataUrl) ? program.attachments[0].dataUrl : defaultImage,
                joined: program.joined || [],
                pendingJoins: program.pendingJoins || [],
                skills: program.skills || [],
                status: program.status || 'active',
                maxVolunteers: program.maxVolunteers || 0
            };
            return setDoc(doc(db, 'programs', program.id), firestoreData, { merge: true });
        });
        await Promise.all(addPromises);
        console.log('Successfully synced', programs.length, 'programs to Firestore');
    } catch (err) {
        console.warn('Could not sync programs to Firestore', err);
    }
}

// Tab switching
function showTab(tabName) {
    // Support new sidebar layout (ad-tab-* IDs) as well as legacy tab-content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // New sidebar layout
    document.querySelectorAll('.ad-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.ad-sidenav__item[data-tab]').forEach(a => {
        a.classList.toggle('ad-sidenav__item--active', a.dataset.tab === tabName);
    });
    const newTab = document.getElementById('ad-tab-' + tabName);
    if (newTab) newTab.classList.add('active');

    // Legacy: safely add active to old tab-btn if it exists
    const legacyBtn = document.querySelector(`button[onclick="showTab('${tabName}')"]`);
    if (legacyBtn) legacyBtn.classList.add('active');
    const legacyContent = document.getElementById(tabName);
    if (legacyContent) legacyContent.classList.add('active');

    try {
        localStorage.setItem(ACTIVE_TAB_KEY, tabName);
    } catch {
        // ignore storage errors
    }
    updateTab(tabName);
}

function getCurrentActiveTab() {
    const active = document.querySelector('.ad-tab.active') || document.querySelector('.tab-content.active');
    if (active) {
        // strip 'ad-tab-' prefix if present
        return active.id.replace('ad-tab-', '');
    }
    return 'dashboard';
}

function restoreActiveTab() {
    let tab = 'dashboard';
    try {
        tab = localStorage.getItem(ACTIVE_TAB_KEY) || 'dashboard';
    } catch {
        tab = 'dashboard';
    }
    showTab(tab);
}

// Update tab content
// Update tab content
function updateTab(tabName) {
    try {
        switch(tabName) {
            case 'dashboard': updateDashboard(); break;
            case 'analytics': updateAnalytics(); break;
            case 'volunteers': updateVolunteers(); break;
            case 'restrictions': updateRestrictions(); break;
            case 'skills': updateSkills(); break;
            case 'programs': updatePrograms(); break;
            case 'badges': updateBadges(); break;
            case 'certifications': updateCertifications(); break;
            case 'notifications': updateNotifications(); break;
            case 'taskvalidation': updateVolunteers(); break;
            case 'settings': updateRestrictions(); updateSkills(); updateNotifications(); break;
        }
    } catch(e) { console.warn('updateTab error:', tabName, e); }
}

// Dashboard
function updateDashboard() {
    const totalVolunteers = users.filter(u => normalizeStatus(u.status) === 'approved').length;
    const pendingApps = users.filter(u => normalizeStatus(u.status) === 'pending').length;
    const approvedUsers = users.filter(u => normalizeStatus(u.status) === 'approved').length;
    const rejectedUsers = users.filter(u => normalizeStatus(u.status) === 'rejected').length;
    const activePrograms = programs.filter(p => p.status === 'active').length;
    const completedPrograms = programs.filter(p => p.status === 'completed').length;

    document.getElementById('totalVolunteers').textContent = totalVolunteers;
    document.getElementById('pendingApps').textContent = pendingApps;
    document.getElementById('approvedUsers').textContent = approvedUsers;
    document.getElementById('rejectedUsers').textContent = rejectedUsers;
    document.getElementById('activePrograms').textContent = activePrograms;
    document.getElementById('completedPrograms').textContent = completedPrograms;

    // Populate dashboard task overview tables
    if (typeof window.refreshAdminDashboard === 'function') {
        window.refreshAdminDashboard(programs);
    }
}

// Analytics
function updateAnalytics() {
    const totalHours = users.reduce((sum, u) => sum + (u.hours || 0), 0);
    const activeVolunteers = users.filter(u => normalizeStatus(u.status) === 'approved' && u.hours > 0).length;
    const inactiveVolunteers = users.filter(u => normalizeStatus(u.status) === 'approved' && u.hours === 0).length;
    const completedProgramsCount = programs.filter(p => p.status === 'completed').length;
    const totalPrograms = programs.length;
    const completionRate = totalPrograms > 0 ? Math.round((completedProgramsCount / totalPrograms) * 100) : 0;

    document.getElementById('totalHours').textContent = `${totalHours} hours`;
    document.getElementById('activeInactive').textContent = `${activeVolunteers} active, ${inactiveVolunteers} inactive`;
    document.getElementById('completionRate').textContent = `${completionRate}%`;

    // Top programs
    const programCounts = {};
    programs.forEach(p => {
        if (p.status === 'completed') {
            programCounts[p.name] = (programCounts[p.name] || 0) + 1;
        }
    });
    const topPrograms = Object.entries(programCounts).sort((a,b) => b[1] - a[1]).slice(0, 3);
    document.getElementById('topPrograms').innerHTML = topPrograms.length > 0
        ? topPrograms.map(([name, count]) => `<li>${name}: ${count} completions</li>`).join('')
        : '<li>No completed programs yet.</li>';

    // Badge distribution
    const badges = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0, None: 0 };
    users.forEach(u => {
        badges[u.badge || 'None']++;
    });
    document.getElementById('badgeChart').innerHTML = Object.entries(badges).map(([badge, count]) => `<div>${badge}: ${count}</div>`).join('');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = users.filter((u) => {
        if (!u.createdAt) return false;
        const createdDate = new Date(u.createdAt);
        return !Number.isNaN(createdDate.getTime()) && createdDate >= monthStart;
    }).length;
    document.getElementById('volunteerGrowth').textContent = `Growth over time: +${newThisMonth} this month`;

    // Refresh analytics charts in new layout
    if (typeof window.refreshAnalyticsCharts === 'function') {
        window.refreshAnalyticsCharts(users, programs);
    }
}

// Volunteers
function updateVolunteers() {
    // Keep volunteers/programs in sync with latest Program Management changes.
    refreshLocalAdminCache();

    const list = document.getElementById('volunteerList');
    const statusFilter = document.getElementById('volunteerStatusFilter')?.value || 'approved';
    const filteredUsers = statusFilter === 'all'
        ? users
        : users.filter((u) => normalizeStatus(u.status) === statusFilter);

    // Pending validation section — volunteers who submitted tasks for admin review
    const pendingValidationItems = [];
    users.forEach(u => {
        (u.pendingValidation || []).forEach(programId => {
            const prog = programs.find(p => p.id === programId);
            pendingValidationItems.push({ user: u, programId, programName: prog ? (prog.name || prog.title) : programId });
        });
    });

    const pendingValidationHTML = pendingValidationItems.length > 0 ? `
        <div style="margin-bottom:20px; padding:16px; border-radius:14px; background:rgba(255,248,236,0.12); border:1px solid rgba(255,248,236,0.2);">
            <strong style="display:block;margin-bottom:12px;">⏳ Pending Task Validation (${pendingValidationItems.length})</strong>
            ${pendingValidationItems.map(item => `
                <div class="volunteer-item" style="margin-bottom:10px;">
                    <div>
                        <strong>${item.user.name}</strong> submitted <em>${item.programName}</em> for validation<br>
                        <small>Hours: ${item.user.hours || 0} | Badge: ${item.user.badge || 'None'}</small>
                    </div>
                    <div>
                        <button class="approve-btn" onclick="approveTaskValidation('${item.programId}','${item.user.id}')">Approve ✓</button>
                        <button class="reject-btn" onclick="rejectTaskValidation('${item.programId}','${item.user.id}')">Reject ✗</button>
                    </div>
                </div>
            `).join('')}
        </div>
    ` : '';
    list.innerHTML = pendingValidationHTML + `
        <div class="volunteer-section">
            <div class="volunteer-card">
                <strong>${statusFilter === 'pending' ? 'Pending Volunteers' : `Volunteers (${statusFilter})`}</strong>
                ${filteredUsers.map(u => `
                    <div class="volunteer-item">
                        <div>
                            <strong>${u.name}</strong><br>
                            Email: ${u.email}<br>
                            Age: ${u.age}, Barangay: ${u.barangay}<br>
                            Skills: ${Array.isArray(u.skills) ? u.skills.join(', ') : ''}<br>
                            Enrolled: ${Array.isArray(u.enrolledPrograms) ? u.enrolledPrograms.join(', ') : 'None'}<br>
                            Completed: ${Array.isArray(u.completedPrograms) ? u.completedPrograms.join(', ') : 'None'}<br>
                            Status: ${normalizeStatus(u.status)}, Hours: ${u.hours || 0}, Badge: ${u.badge || 'None'}
                        </div>
                        <div>
                            ${normalizeStatus(u.status) === 'pending' ? `
                                <button class="approve-btn" onclick="approveUser('${u.id}')">Approve</button>
                                <button class="reject-btn" onclick="rejectUser('${u.id}')">Reject</button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    updateVolunteerProgramFilter();
    updateVolunteerProgramParticipants();
    updateAttendanceProgramOptions();

    // Refresh task validation tab
    if (typeof window.refreshTaskValidation === 'function') {
        window.refreshTaskValidation(users, programs);
    }
}

function updateVolunteerProgramFilter() {
    // Always pull latest program list from local cache source.
    refreshLocalAdminCache();

    const filter = document.getElementById('volunteerProgramFilter');
    if (!filter) return;
    filter.innerHTML = programs.map(program => `
        <option value="${program.id}">${program.name || program.title || 'Untitled Program'}</option>
    `).join('');
    if (!filter.value && programs.length > 0) {
        filter.value = programs[0].id;
    }
}

function updateAttendanceProgramOptions() {
    const select = document.getElementById('attendanceProgramSelect');
    if (!select) return;
    select.innerHTML = programs.map((program) => `
        <option value="${program.id}">${program.name || program.title || 'Untitled Program'}</option>
    `).join('');
    if (!select.value && programs.length > 0) {
        select.value = programs[0].id;
    }
    updateAttendanceVolunteerOptions();
}

function updateAttendanceVolunteerOptions() {
    const programSelect = document.getElementById('attendanceProgramSelect');
    const volunteerSelect = document.getElementById('attendanceVolunteerSelect');
    if (!programSelect || !volunteerSelect) return;
    const programId = programSelect.value;
    const official = getOfficialParticipantsForProgram(programId);
    volunteerSelect.innerHTML = official.map((u) => `
        <option value="${u.id}">${u.name} (${u.email || 'no email'})</option>
    `).join('');
}

function getOfficialParticipantsForProgram(programId) {
    // Officially joined means: program.joined contains userId AND volunteer is approved
    const program = programs.find(p => p.id === programId) || {};
    const joined = Array.isArray(program.joined) ? program.joined : [];
    return users.filter((u) =>
        normalizeStatus(u.status) === 'approved' &&
        joined.includes(u.id)
    );
}

function getPendingParticipantsForProgram(programId) {
    const program = programs.find(p => p.id === programId) || {};
    const pending = Array.isArray(program.pendingJoins) ? program.pendingJoins : [];
    return users.filter((u) =>
        normalizeStatus(u.status) === 'approved' &&
        pending.includes(u.id)
    );
}

function isFinishedForProgram(user, programId) {
    return Array.isArray(user.completedPrograms) && user.completedPrograms.includes(programId);
}

function updateVolunteerProgramParticipants() {
    refreshLocalAdminCache();

    const filter = document.getElementById('volunteerProgramFilter');
    const joinStatusFilter = 'all';
    const participantContainer = document.getElementById('programParticipantList');
    if (!filter || !participantContainer) return;

    const programId = filter.value;
    const program = programs.find(p => p.id === programId) || {};
    const official = getOfficialParticipantsForProgram(programId);
    const pending = getPendingParticipantsForProgram(programId);

    const finishedOfficial = official.filter((u) => isFinishedForProgram(u, programId));
    const notFinishedOfficial = official.filter((u) => !isFinishedForProgram(u, programId));

    let shown = official;
    if (joinStatusFilter === 'pending') shown = pending;
    if (joinStatusFilter === 'finished') shown = finishedOfficial;
    if (joinStatusFilter === 'not_finished') shown = notFinishedOfficial;
    if (joinStatusFilter === 'all') shown = [...official, ...pending];

    participantContainer.innerHTML = `
        <div style="padding: 16px; border-radius: 14px; background: rgba(255,255,255,0.08); margin-bottom: 18px;">
            <strong>Participants for:</strong> ${program.name || program.title || 'Selected Program'}<br>
            <small>
                Official: ${official.length} • Pending: ${pending.length} • Finished: ${finishedOfficial.length}
            </small>
        </div>
        ${shown.length > 0 ? shown.map(user => {
            const inPending = Array.isArray(program.pendingJoins) && program.pendingJoins.includes(user.id);
            const inOfficial = Array.isArray(program.joined) && program.joined.includes(user.id);
            const finished = isFinishedForProgram(user, programId);
            return `
            <div class="volunteer-item">
                <div>
                    <strong>${user.name}</strong><br>
                    Email: ${user.email || 'N/A'}<br>
                    Hours: ${user.hours || 0}<br>
                    Completed Programs: ${Array.isArray(user.completedPrograms) ? user.completedPrograms.join(', ') : 'None'}
                </div>
                <div>
                    ${inPending ? `
                        <button class="approve-btn" onclick="approveJoinRequest('${programId}','${user.id}')">Approve join</button>
                        <button class="reject-btn" onclick="rejectJoinRequest('${programId}','${user.id}')">Reject</button>
                    ` : finished ? `
                        <span style="display:inline-block;padding:8px 12px;border-radius:12px;background:#5cb85c;color:#fff;">Finished</span>
                    ` : inOfficial ? `
                        <button class="approve-btn" onclick="markVolunteerCompleted('${programId}','${user.id}')">Mark finished</button>
                    ` : `
                        <span style="display:inline-block;padding:8px 12px;border-radius:12px;background:#6c757d;color:#fff;">Not official</span>
                    `}
                </div>
            </div>
        `;
        }).join('') : '<div>No participants in this view yet.</div>'}
    `;
}

function onVolunteerProgramFilterChange() {
    updateVolunteerProgramParticipants();
    updateAttendanceProgramOptions();
}

function onVolunteerStatusFilterChange() {
    updateVolunteers();
    updateVolunteerProgramParticipants();
}

window.forceSyncData = () => {
    const activeTab = getCurrentActiveTab();
    try {
        users = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
        programs = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
    } catch {
        users = [];
        programs = [];
    }
    updateDashboard();
    updateAnalytics();
    updatePrograms();
    updateVolunteers();
    updateVolunteerProgramFilter();
    updateVolunteerProgramParticipants();
    updateAttendanceProgramOptions();
    showTab(activeTab);
    alert('Manual sync complete.');
};

async function approveJoinRequest(programId, userId) {
    const program = programs.find(p => p.id === programId);
    const user = users.find(u => u.id === userId);
    if (!program || !user) {
        alert('Program or user not found.');
        return;
    }
    if (normalizeStatus(user.status) !== 'approved') {
        alert('User must be approved before joining programs.');
        return;
    }

    program.pendingJoins = Array.isArray(program.pendingJoins) ? program.pendingJoins : [];
    program.joined = Array.isArray(program.joined) ? program.joined : [];

    program.pendingJoins = program.pendingJoins.filter((id) => id !== userId);
    if (!program.joined.includes(userId)) {
        program.joined.push(userId);
    }

    user.enrolledPrograms = Array.isArray(user.enrolledPrograms) ? user.enrolledPrograms : [];
    if (!user.enrolledPrograms.includes(programId)) {
        user.enrolledPrograms.push(programId);
    }

    savePrograms();
    saveUsers();

    if (useFirestore) {
        try {
            await setDoc(doc(db, 'programs', programId), {
                joined: program.joined,
                pendingJoins: program.pendingJoins
            }, { merge: true });
            await setDoc(doc(db, 'volunteers', userId), {
                enrolledPrograms: arrayUnion(programId)
            }, { merge: true });
        } catch (err) {
            console.warn('Could not sync join approval to Firestore', err);
        }
    }

    updateVolunteerProgramParticipants();
    alert(`${user.name} is now officially joined to ${program.name || program.title}.`);
}

async function rejectJoinRequest(programId, userId) {
    const program = programs.find(p => p.id === programId);
    const user = users.find(u => u.id === userId);
    if (!program || !user) {
        alert('Program or user not found.');
        return;
    }

    program.pendingJoins = Array.isArray(program.pendingJoins) ? program.pendingJoins : [];
    program.pendingJoins = program.pendingJoins.filter((id) => id !== userId);

    savePrograms();

    if (useFirestore) {
        try {
            await setDoc(doc(db, 'programs', programId), {
                pendingJoins: program.pendingJoins
            }, { merge: true });
        } catch (err) {
            console.warn('Could not sync join rejection to Firestore', err);
        }
    }

    updateVolunteerProgramParticipants();
    alert(`Join request removed for ${user.name}.`);
}

async function markVolunteerCompleted(programId, userId) {
    const program = programs.find(p => p.id === programId);
    const user = users.find(u => u.id === userId);
    if (!program || !user) {
        alert('Program or user not found.');
        return;
    }
    program.joined = Array.isArray(program.joined) ? program.joined : [];
    if (!program.joined.includes(userId)) {
        alert('Only officially joined volunteers can be marked finished.');
        return;
    }
    user.enrolledPrograms = Array.isArray(user.enrolledPrograms) ? user.enrolledPrograms : [];
    user.completedPrograms = Array.isArray(user.completedPrograms) ? user.completedPrograms : [];
    if (user.completedPrograms.includes(programId)) {
        alert('This participant is already marked finished.');
        return;
    }
    user.completedPrograms.push(programId);
    // Remove from pendingValidation if present
    user.pendingValidation = Array.isArray(user.pendingValidation) ? user.pendingValidation.filter(id => id !== programId) : [];
    user.hours = (user.hours || 0) + (program.hours || 0);
    // Auto-update badge based on admin-defined thresholds
    updateBadge(user);
    saveUsers();

    if (useFirestore) {
        try {
            await setDoc(doc(db, 'volunteers', userId), {
                hours: user.hours,
                badge: user.badge || 'None',
                enrolledPrograms: arrayUnion(programId),
                completedPrograms: arrayUnion(programId),
                pendingValidation: user.pendingValidation
            }, { merge: true });
        } catch (err) {
            console.warn('Could not update volunteer completion in Firestore', err);
        }
    }

    // Send notification to volunteer
    sendNotification(
        `Your completion of "${program.name || program.title}" has been approved! ${program.hours || 0} hours added to your total.`,
        'program',
        user.email
    );

    updateVolunteerProgramParticipants();
    updateVolunteers();
    updateDashboard();
    updateAnalytics();
    alert(`${user.name} has been marked finished for ${program.name || program.title}. Hours updated.`);
}

window.markVolunteerCompleted = markVolunteerCompleted;
window.approveJoinRequest = approveJoinRequest;
window.rejectJoinRequest = rejectJoinRequest;

/* ── Task Validation: Admin approves/rejects user-submitted completions ── */
async function approveTaskValidation(programId, userId) {
    // Delegates to markVolunteerCompleted which adds hours, updates badge, clears pendingValidation
    await markVolunteerCompleted(programId, userId);
}

async function rejectTaskValidation(programId, userId) {
    const user = users.find(u => u.id === userId);
    const program = programs.find(p => p.id === programId);
    if (!user || !program) { alert('User or program not found.'); return; }

    // Remove from pendingValidation → task returns to "In Progress"
    user.pendingValidation = Array.isArray(user.pendingValidation)
        ? user.pendingValidation.filter(id => id !== programId)
        : [];
    saveUsers();

    if (useFirestore) {
        try {
            await setDoc(doc(db, 'volunteers', userId), {
                pendingValidation: user.pendingValidation
            }, { merge: true });
        } catch(err) { console.warn('Could not update Firestore pendingValidation', err); }
    }

    sendNotification(
        `Your completion submission for "${program.name || program.title}" was not approved. Please continue and resubmit when ready.`,
        'program',
        user.email
    );
    logAction('task_reject', `Rejected task validation for ${user.name}: ${program.name || program.title}`, { userId, programId });
    updateVolunteers();
    alert(`Rejected. "${program.name || program.title}" returned to In Progress for ${user.name}.`);
}

window.approveTaskValidation = approveTaskValidation;
window.rejectTaskValidation = rejectTaskValidation;
window.updateAttendanceVolunteerOptions = updateAttendanceVolunteerOptions;
window.onVolunteerProgramFilterChange = onVolunteerProgramFilterChange;
window.onVolunteerStatusFilterChange = onVolunteerStatusFilterChange;

async function markVolunteerAbsent(programId, userId) {
    const program = programs.find(p => p.id === programId);
    const user = users.find(u => u.id === userId);
    if (!program || !user) {
        alert('Program or user not found.');
        return;
    }

    program.joined = Array.isArray(program.joined) ? program.joined : [];
    if (!program.joined.includes(userId)) {
        alert('Only officially joined volunteers can be marked absent.');
        return;
    }

    program.joined = program.joined.filter((id) => id !== userId);
    program.absent = Array.isArray(program.absent) ? program.absent : [];
    if (!program.absent.includes(userId)) {
        program.absent.push(userId);
    }

    user.enrolledPrograms = Array.isArray(user.enrolledPrograms) ? user.enrolledPrograms : [];
    user.enrolledPrograms = user.enrolledPrograms.filter((id) => id !== programId);
    user.absentPrograms = Array.isArray(user.absentPrograms) ? user.absentPrograms : [];
    if (!user.absentPrograms.includes(programId)) {
        user.absentPrograms.push(programId);
    }

    savePrograms();
    saveUsers();

    if (useFirestore) {
        try {
            await setDoc(doc(db, 'programs', programId), {
                joined: program.joined,
                absent: program.absent
            }, { merge: true });
            await setDoc(doc(db, 'volunteers', userId), {
                enrolledPrograms: arrayRemove(programId),
                absentPrograms: arrayUnion(programId)
            }, { merge: true });
        } catch (err) {
            console.warn('Could not sync absent update to Firestore', err);
        }
    }

    updateVolunteerProgramParticipants();
    updateAttendanceVolunteerOptions();
    alert(`${user.name} was marked absent for ${program.name || program.title}.`);
}

async function markVolunteerFinishedFromSelection() {
    const programId = document.getElementById('attendanceProgramSelect')?.value;
    const userId = document.getElementById('attendanceVolunteerSelect')?.value;
    if (!programId || !userId) {
        alert('Please select a program and volunteer.');
        return;
    }
    await markVolunteerCompleted(programId, userId);
    updateAttendanceVolunteerOptions();
}

async function markVolunteerAbsentFromSelection() {
    const programId = document.getElementById('attendanceProgramSelect')?.value;
    const userId = document.getElementById('attendanceVolunteerSelect')?.value;
    if (!programId || !userId) {
        alert('Please select a program and volunteer.');
        return;
    }
    await markVolunteerAbsent(programId, userId);
}

window.markVolunteerFinishedFromSelection = markVolunteerFinishedFromSelection;
window.markVolunteerAbsentFromSelection = markVolunteerAbsentFromSelection;

function hasCompletedProgram(user, programId) {
    return Array.isArray(user.completedPrograms) && user.completedPrograms.includes(programId);
}

function approveUser(id) {
    const user = users.find(u => u.id === id);
    if (user) {
        user.status = 'approved';
        saveUsers();
        updateVolunteers();
        sendNotification(`Your application has been approved!`, 'application', user.email);
        logAction('volunteer_approve', `Approved volunteer: ${user.name} (${user.email})`, { userId: id, userEmail: user.email });
        // Update Firestore
        if (useFirestore) {
            updateDoc(doc(db, 'volunteers', id), { status: 'approved' }).catch(err => console.warn('Could not update Firestore', err));
        }
    }
}

function rejectUser(id) {
    const user = users.find(u => u.id === id);
    if (user) {
        user.status = 'rejected';
        saveUsers();
        updateVolunteers();
        sendNotification(`Your application has been rejected.`, 'application', user.email);
        logAction('volunteer_reject', `Rejected volunteer: ${user.name} (${user.email})`, { userId: id, userEmail: user.email });
        // Update Firestore
        if (useFirestore) {
            updateDoc(doc(db, 'volunteers', id), { status: 'rejected' }).catch(err => console.warn('Could not update Firestore', err));
        }
    }
}

// Restrictions
function loadRestrictionsUI() {
    document.getElementById('minAge').value = restrictions.minAge;
    document.getElementById('validBarangays').value = restrictions.validBarangays;
}

function updateRestrictions() {
    loadRestrictionsUI();
}

function saveRestrictionsFromUI() {
    restrictions.minAge = parseInt(document.getElementById('minAge').value);
    restrictions.validBarangays = document.getElementById('validBarangays').value;
    saveRestrictions();
    alert('Restrictions updated!');
}

// ── Skills — Firestore-backed ──────────────────────────────────────────────

// ── Skills — Firestore real-time ──────────────────────────────────────────

let skillsUnsubscribe = null;

function fetchAndRenderSkills() {
    if (skillsUnsubscribe) return; // already listening
    skillsUnsubscribe = onSnapshot(
        collection(db, 'skills'),
        (snap) => {
            skills = [];
            snap.forEach(d => skills.push({ id: d.id, name: d.data().name || d.id }));
            // Sort alphabetically
            skills.sort((a, b) => a.name.localeCompare(b.name));
            updateSkills();
        },
        (err) => {
            console.error('[admin] skills onSnapshot error:', err.code, err.message);
            updateSkills();
        }
    );
}

function updateSkills() {
    // Render into the Settings tab list (settingsSkillList)
    const el = document.getElementById('settingsSkillList') || document.getElementById('skillList');
    if (!el) return;
    if (!skills.length) {
        el.innerHTML = '<li style="padding:12px 0;opacity:0.6;font-family:\'Montserrat\',sans-serif;font-size:0.85rem;list-style:none;">No skill categories yet. Click "Add New Category" to create one.</li>';
        return;
    }
    el.innerHTML = skills.map(s => {
        const name = typeof s === 'string' ? s : s.name;
        const id   = typeof s === 'string' ? name : s.id;
        return `<li style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid var(--border);list-style:none;">
            <span style="font-family:'Montserrat',sans-serif;font-size:0.9rem;font-weight:600;color:var(--primary);">${name}</span>
            <span style="display:flex;gap:6px;">
                <button class="edit-btn"   onclick="editSkill('${id.replace(/'/g,"\\'")}')">Edit</button>
                <button class="delete-btn" onclick="deleteSkill('${id.replace(/'/g,"\\'")}')">Delete</button>
            </span>
        </li>`;
    }).join('');
}

async function addSkill() {
    const input = document.getElementById('settingsNewSkill') || document.getElementById('newSkill');
    const name  = (input?.value || '').trim();
    if (!name) { input?.focus(); return; }

    const btn = document.getElementById('settingsAddSkillBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
        // Check for duplicate
        const existing = skills.find(s => (typeof s === 'string' ? s : s.name).toLowerCase() === name.toLowerCase());
        if (existing) { alert('This skill category already exists.'); return; }

        await addDoc(collection(db, 'skills'), { name, createdAt: new Date().toISOString() });

        // Reset form — onSnapshot will re-render the list automatically
        if (input) input.value = '';
        const row = document.getElementById('settingsNewSkillRow') || document.getElementById('newSkillRow');
        if (row) row.style.display = 'none';
    } catch (err) {
        console.error('[admin] addSkill error:', err);
        alert('Failed to add skill: ' + (err.message || err));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
}

async function deleteSkill(idOrName) {
    if (!confirm('Delete this skill category?')) return;
    try {
        const snap = await getDocs(collection(db, 'skills'));
        for (const d of snap.docs) {
            if (d.id === idOrName || d.data().name === idOrName) {
                await deleteDoc(d.ref);
                break;
            }
        }
        // onSnapshot fires automatically and re-renders the list
    } catch (err) {
        console.error('[admin] deleteSkill error:', err);
        alert('Failed to delete skill: ' + (err.message || err));
    }
}

async function editSkill(idOrName) {
    const current = skills.find(s => (typeof s === 'string' ? s : s.id || s.name) === idOrName);
    const currentName = current ? (typeof current === 'string' ? current : current.name) : idOrName;
    const updated = prompt('Edit skill category:', currentName);
    if (!updated || !updated.trim() || updated.trim() === currentName) return;

    try {
        const snap = await getDocs(collection(db, 'skills'));
        for (const d of snap.docs) {
            if (d.id === idOrName || d.data().name === currentName) {
                await setDoc(d.ref, { name: updated.trim() }, { merge: true });
                break;
            }
        }
        // onSnapshot fires automatically and re-renders the list
    } catch (err) {
        console.error('[admin] editSkill error:', err);
        alert('Failed to edit skill: ' + (err.message || err));
    }
}

// Programs
function filterPrograms(term) {
    updatePrograms(term);
}

function renderProgramRows(list, filtered) {
    if (!list) return;
    if (!filtered.length) {
        list.innerHTML = '<div style="padding:14px 18px;opacity:0.6;font-family:\'Montserrat\',sans-serif;font-size:0.85rem;">No programs yet.</div>';
        return;
    }
    list.innerHTML = filtered.map(p => {
        const joined      = Array.isArray(p.joined) ? p.joined.length : 0;
        const maxVol      = p.maxVolunteers || 0;
        const isFull      = maxVol > 0 && joined >= maxVol;
        const statusLabel = isFull ? 'Full' : (p.status || 'active');
        return `
        <div class="ad-task-row" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;">
          <span style="font-weight:600;">${p.name || p.title || 'Untitled'}</span>
          <span>${p.hours ?? 0}</span>
          <span>${maxVol || '—'}</span>
          <span>${joined}</span>
          <span>${statusLabel}</span>
          <span style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="edit-btn" onclick="editProgram('${p.id}')">Edit</button>
            <button class="delete-btn" onclick="deleteProgram('${p.id}')">Delete</button>
          </span>
        </div>`;
    }).join('');
}

function updatePrograms(searchTerm) {
    const term = (searchTerm !== undefined
        ? searchTerm
        : (document.getElementById('programSearchInput')?.value || '')
    ).toLowerCase().trim();

    const filtered = term
        ? programs.filter(p => (p.name || p.title || '').toLowerCase().includes(term) || (p.desc || '').toLowerCase().includes(term))
        : programs;

    // Task Management tab list
    renderProgramRows(document.getElementById('programList'), filtered);
    // Settings tab list (always shows full unfiltered list)
    renderProgramRows(document.getElementById('settingsProgramList'), programs);
}

function showProgramModal(programId = null) {
    const modal = document.getElementById('programModal');
    const title = document.getElementById('programModalTitle');
    const name = document.getElementById('programName');
    const desc = document.getElementById('programDesc');
    const hours = document.getElementById('programHours');
    const maxVol = document.getElementById('programMaxVolunteers');

    if (programId) {
        const program = programs.find(p => p.id === programId);
        title.textContent = 'Edit Program';
        name.value = program.name;
        desc.value = program.desc;
        hours.value = program.hours;
        maxVol.value = program.maxVolunteers;
        document.getElementById('programRequirement').value = program.requirement || 'None';
        // show existing attachments
        renderProgramAttachmentPreview(program.attachments || []);
        // do not auto-populate file input for security reasons
        const input = document.getElementById('programAttachments');
        if (input) input.value = '';
        modal.dataset.editId = programId;
    } else {
        title.textContent = 'Create Program';
        name.value = '';
        desc.value = '';
        hours.value = '';
        document.getElementById('programRequirement').value = 'None';
        maxVol.value = '';
        clearAttachmentInput();
        delete modal.dataset.editId;
    }
    modal.style.display = 'flex';
}

function closeProgramModal() {
    document.getElementById('programModal').style.display = 'none';
}

async function saveProgram() {
    const name        = document.getElementById('programName').value.trim();
    const desc        = document.getElementById('programDesc').value.trim();
    const hours       = parseInt(document.getElementById('programHours').value);
    const requirement = document.getElementById('programRequirement').value || 'None';
    let   maxVol      = parseInt(document.getElementById('programMaxVolunteers').value);
    if (Number.isNaN(maxVol) || maxVol <= 0) maxVol = 10;

    if (!name || !desc || Number.isNaN(hours) || hours <= 0) {
        alert('Please fill all required fields (name, description, hours).');
        return;
    }

    const modal   = document.getElementById('programModal');
    const saveBtn = document.getElementById('saveProgramBtn');
    const editId  = modal.dataset.editId;

    // Pessimistic UI — disable button immediately
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Syncing with Cloud...'; }

    const newAttachments = await getAttachmentsFromInput();
    const imageUrl = newAttachments.length > 0 ? newAttachments[0].dataUrl : '';

    const programData = {
        name, title: name, desc, hours, requirement,
        maxVolunteers: maxVol, status: 'active',
        joined: [], pendingJoins: [], assigned: [],
        image: imageUrl,
        updatedAt: new Date().toISOString()
    };

    try {
        // Ensure auth is ready before attempting Firestore write
        await authReadyPromise;
        
        console.log('[saveProgram] Auth ready check:', {
            currentUser: auth.currentUser ? `${auth.currentUser.email}` : 'null',
            useFirestore
        });
        
        if (!auth.currentUser) {
            alert('Not authenticated. Please log in again.');
            return;
        }

        if (editId) {
            // Edit existing
            console.log('[saveProgram] Updating program:', editId);
            await setDoc(doc(db, 'programs', editId), programData, { merge: true });
            logAction('program_update', `Updated program: "${name}"`, { programId: editId });
        } else {
            // Add new — Firestore generates the ID
            console.log('[saveProgram] Creating new program');
            programData.createdAt = new Date().toISOString();
            await addDoc(collection(db, 'programs'), programData);
            logAction('program_add', `Created program: "${name}" (${hours} hours)`, { hours });
        }

        // Success — onSnapshot will auto-update the list; just close and reset the form
        closeProgramModal();
        document.getElementById('programName').value = '';
        document.getElementById('programDesc').value = '';
        document.getElementById('programHours').value = '';
        document.getElementById('programMaxVolunteers').value = '';
        clearAttachmentInput();
        delete modal.dataset.editId;

    } catch (err) {
        console.error('saveProgram error:', err);
        let errorMsg = err.message || err;
        if (errorMsg.includes('Missing or insufficient permissions')) {
            errorMsg = 'Permission denied. Check Firestore rules and ensure you are authenticated.';
        }
        alert('Failed to save program: ' + errorMsg);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    }
}

// Real-time listener for the 'programs' collection — updates UI instantly on any change
let programsUnsubscribe = null;

async function fetchAndRenderPrograms() {
    // Unsubscribe any existing listener first
    if (programsUnsubscribe) { programsUnsubscribe(); programsUnsubscribe = null; }

    try {
        programsUnsubscribe = onSnapshot(
            collection(db, 'programs'),
            (snap) => {
                programs = [];
                snap.forEach(d => programs.push({ id: d.id, ...d.data() }));
                programs.sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1);
                localStorage.setItem('itanimPrograms', JSON.stringify(programs));
                updatePrograms();
                updateDashboard();
                if (typeof window.refreshAdminDashboard === 'function') window.refreshAdminDashboard(programs);
            },
            (err) => {
                console.error('[admin] programs onSnapshot error:', err.code, err.message);
                updatePrograms(); // render empty state / cached data
            }
        );
    } catch (err) {
        console.error('[admin] fetchAndRenderPrograms setup error:', err);
        updatePrograms();
    }
}

function editProgram(id) {
    showProgramModal(id);
}

function archiveProgram(id) {
    const program = programs.find(p => p.id === id);
    if (program) {
        program.status = 'completed';
        savePrograms();
        syncProgramsFromPrograms();
        updatePrograms();
    }
}

async function deleteProgram(id) {
    const programName = programs.find(p => p.id === id)?.name || 'Unknown';
    programs = programs.filter(p => p.id !== id);
    savePrograms();
    // Delete from the unified 'programs' collection
    if (useFirestore) {
        try {
            await deleteDoc(doc(db, 'programs', id));
        } catch (err) {
            console.warn('Could not delete program from Firestore', err);
        }
    }
    logAction('program_delete', `Deleted program: "${programName}"`, { programId: id });
    await fetchAndRenderPrograms();
}

// Validation
function updateValidation() {
    const submitted = programs.filter(p => p.status === 'completed' && !p.validated);
    document.getElementById('submittedPrograms').innerHTML = submitted.map(p => `
        <div class="program-item">
            <div>
                <strong>${p.name}</strong><br>
                Completed by: ${p.assigned.join(', ')}<br>
                Hours: ${p.hours}
            </div>
            <div>
                <button class="approve-btn" onclick="approveProgram('${p.id}')">Approve</button>
                <button class="reject-btn" onclick="rejectProgram('${p.id}')">Reject</button>
            </div>
        </div>
    `).join('');
}

async function approveProgram(id) {
    const program = programs.find(p => p.id === id);
    if (program) {
        program.validated = true;
        const participants = Array.isArray(program.assigned) && program.assigned.length > 0 ? program.assigned : Array.isArray(program.joined) ? program.joined : [];
        for (const userId of participants) {
            const user = users.find(u => u.id === userId);
            if (user) {
                user.hours = (user.hours || 0) + (program.hours || 0);
                user.enrolledPrograms = Array.isArray(user.enrolledPrograms) ? user.enrolledPrograms : [];
                if (!user.enrolledPrograms.includes(id)) {
                    user.enrolledPrograms.push(id);
                }
                user.completedPrograms = Array.isArray(user.completedPrograms) ? user.completedPrograms : [];
                if (!user.completedPrograms.includes(id)) {
                    user.completedPrograms.push(id);
                }
                updateBadge(user);

                if (useFirestore) {
                    try {
                        await setDoc(doc(db, 'volunteers', user.id), {
                            hours: user.hours,
                            enrolledPrograms: arrayUnion(id),
                            completedPrograms: arrayUnion(id)
                        }, { merge: true });
                    } catch (err) {
                        console.warn('Could not update volunteer completion in Firestore', err);
                    }
                }
            }
        }
        saveUsers();
        savePrograms();
        updateValidation();
        updateDashboard();
        updateAnalytics();
        sendNotification(`Program "${program.name}" has been approved! You earned ${program.hours} hours.`, 'program', participants.map(uid => users.find(u => u.id === uid)?.email).filter(Boolean));
    }
}

function rejectProgram(id) {
    const program = programs.find(p => p.id === id);
    if (program) {
        program.status = 'active';
        program.validated = false;
        savePrograms();
        updateValidation();
        const participants = Array.isArray(program.assigned) ? program.assigned : Array.isArray(program.joined) ? program.joined : [];
        sendNotification(`Program "${program.name}" has been rejected and returned to In Progress.`, 'program', participants.map(uid => users.find(u => u.id === uid)?.email).filter(Boolean));
    }
}

function updateBadge(user) {
    const hours = user.hours || 0;
    if (hours >= badgeThresholds.platinum) user.badge = 'Platinum';
    else if (hours >= badgeThresholds.gold) user.badge = 'Gold';
    else if (hours >= badgeThresholds.silver) user.badge = 'Silver';
    else if (hours >= badgeThresholds.bronze) user.badge = 'Bronze';
    else user.badge = 'None';
}

// Badges
function updateBadges() {
    document.getElementById('bronzeThreshold').value = badgeThresholds.bronze;
    document.getElementById('silverThreshold').value = badgeThresholds.silver;
    document.getElementById('goldThreshold').value = badgeThresholds.gold;
    document.getElementById('platinumThreshold').value = badgeThresholds.platinum;
}

function updateBadgeThresholds() {
    badgeThresholds.bronze = parseInt(document.getElementById('bronzeThreshold').value);
    badgeThresholds.silver = parseInt(document.getElementById('silverThreshold').value);
    badgeThresholds.gold = parseInt(document.getElementById('goldThreshold').value);
    badgeThresholds.platinum = parseInt(document.getElementById('platinumThreshold').value);
    saveBadges();
    // Update all user badges
    users.forEach(updateBadge);
    saveUsers();
    alert('Badge thresholds updated!');
}

// Certifications
function getUserCertificationEligibility(user) {
    const hours = Number(user?.hours || 0);
    const completedCount = Array.isArray(user?.completedPrograms) ? user.completedPrograms.length : 0;
    return {
        eligible: hours > 0 && completedCount > 0,
        hours,
        completedCount
    };
}

function getCertificationStatusBadge(status) {
    const normalized = String(status || '').toLowerCase().trim();
    const colorMap = {
        requested: { bg: '#f0ad4e', text: '#1f1f1f', label: 'Requested' },
        approved: { bg: '#5cb85c', text: '#ffffff', label: 'Approved' },
        rejected: { bg: '#d9534f', text: '#ffffff', label: 'Rejected' },
        cancelled: { bg: '#6c757d', text: '#ffffff', label: 'Cancelled' },
        pending: { bg: '#f0ad4e', text: '#1f1f1f', label: 'Pending' }
    };
    const style = colorMap[normalized] || { bg: '#6c757d', text: '#ffffff', label: normalized || 'Unknown' };
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${style.bg};color:${style.text};font-size:12px;font-weight:700;">${style.label}</span>`;
}

function updateCertifications() {
    const list = document.getElementById('certRequests');
    const eligibleUsers = users.filter((u) => {
        const eligibility = getUserCertificationEligibility(u);
        const hasActiveOrApproved = certifications.some((c) => c.userId === u.id && ['requested', 'approved'].includes(c.status));
        return eligibility.eligible && !hasActiveOrApproved;
    });

    const requested = certifications.filter((c) => c.status === 'requested');
    const reviewed = certifications.filter((c) => ['approved', 'rejected', 'cancelled'].includes(c.status));

    const eligibleMarkup = eligibleUsers.length > 0
        ? eligibleUsers.map((u) => {
            const e = getUserCertificationEligibility(u);
            return `<li>${u.name} (${u.email}) - ${e.hours} hrs, ${e.completedCount} completed programs</li>`;
        }).join('')
        : '<li>No additional eligible users right now.</li>';

    const certMarkup = [...requested, ...reviewed].map(c => {
        const user = users.find(u => u.id === c.userId);
        const eligibility = getUserCertificationEligibility(user || {});
        const program = c.programId ? programs.find(p => p.id === c.programId) : null;
        const programLabel = c.programTitle || program?.name || program?.title || '';
        return `
            <div class="cert-item">
                <div>
                    <strong>${user?.name || 'Unknown'}</strong><br>
                    Email: ${user?.email || 'N/A'}<br>
                    Hours: ${eligibility.hours}, Badge: ${user?.badge || 'None'}<br>
                    Completed Programs: ${eligibility.completedCount}<br>
                    ${programLabel ? `Program: ${programLabel}<br>` : ''}
                    Status: ${getCertificationStatusBadge(c.status)}<br>
                    Requested: ${c.requestedAt ? new Date(c.requestedAt).toLocaleString() : 'N/A'}<br>
                    Proof: ${c.proofDetails || 'Not provided'}<br>
                    ${c.adminNote ? `Admin Note: ${c.adminNote}<br>` : ''}
                </div>
                <div>
                    ${c.status === 'pending' ? `
                        <button class="approve-btn" onclick="approveCert('${c.id}')">Approve</button>
                        <button class="reject-btn" onclick="rejectCert('${c.id}')">Reject</button>
                    ` : c.status === 'requested' ? `
                        <button class="approve-btn" onclick="approveCert('${c.id}')">Approve</button>
                        <button class="reject-btn" onclick="rejectCert('${c.id}')">Reject</button>
                        <button class="archive-btn" onclick="cancelCert('${c.id}')">Cancel</button>
                        <button class="edit-btn" onclick="editCert('${c.id}')">Edit</button>
                    ` : `
                        <button class="edit-btn" onclick="editCert('${c.id}')">Edit</button>
                        ${c.status !== 'cancelled' ? `<button class="archive-btn" onclick="cancelCert('${c.id}')">Cancel</button>` : ''}
                    `}
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = `
        <div class="cert-item">
            <strong>Eligible Users (No active request yet)</strong>
            <ul style="margin:8px 0 0 18px;">${eligibleMarkup}</ul>
        </div>
        ${certMarkup || '<p>No certification records yet.</p>'}
    `;
}

function approveCert(id) {
    const cert = certifications.find(c => c.id === id);
    if (cert) {
        const user = users.find(u => u.id === cert.userId);
        const eligibility = getUserCertificationEligibility(user || {});
        if (!eligibility.eligible) {
            alert('Cannot approve: user is not eligible (hours/completed programs requirements not met).');
            return;
        }
        if (!cert.proofDetails || String(cert.proofDetails).trim().length < 10) {
            alert('Cannot approve: proof details are missing or too short.');
            return;
        }
        cert.status = 'approved';
        cert.name = cert.name || 'Volunteer Certification';
        cert.description = cert.description || `Approved certification for ${user?.name || cert.userEmail || 'volunteer'}`;
        cert.issuedDate = new Date().toISOString().slice(0, 10);
        cert.validUntil = `${new Date().getFullYear() + 1}-12-31`;
        cert.approvedAt = new Date().toISOString();
        cert.certificateType = user?.badge && user.badge !== 'None' ? 'with_badge' : 'without_badge';
        cert.adminNote = cert.adminNote || `Approved after verification (${eligibility.hours} hrs, ${eligibility.completedCount} completed).`;
        saveCerts();
        updateCertifications();
        sendNotification(`Your certification request has been approved!`, 'certification', user?.email);
    }
}

function rejectCert(id) {
    const cert = certifications.find(c => c.id === id);
    if (cert) {
        const reason = prompt('Reject reason (optional):', cert.adminNote || '') || '';
        cert.status = 'rejected';
        cert.adminNote = reason.trim() || 'Rejected by admin.';
        cert.rejectedAt = new Date().toISOString();
        saveCerts();
        updateCertifications();
        const user = users.find(u => u.id === cert.userId);
        sendNotification(`Your certification request has been rejected.${reason ? ` Reason: ${reason}` : ''}`, 'certification', user?.email);
    }
}

function cancelCert(id) {
    const cert = certifications.find(c => c.id === id);
    if (!cert) return;
    const reason = prompt('Cancellation note:', cert.adminNote || '') || '';
    cert.status = 'cancelled';
    cert.adminNote = reason.trim() || 'Cancelled by admin.';
    cert.cancelledAt = new Date().toISOString();
    saveCerts();
    updateCertifications();
    const user = users.find(u => u.id === cert.userId);
    sendNotification(`Your certification has been cancelled.${reason ? ` Note: ${reason}` : ''}`, 'certification', user?.email);
}

function editCert(id) {
    const cert = certifications.find(c => c.id === id);
    if (!cert) return;
    const nextName = prompt('Certificate title:', cert.name || 'Volunteer Certification');
    if (!nextName) return;
    const nextDescription = prompt('Certificate description:', cert.description || '');
    if (nextDescription === null) return;
    cert.name = nextName.trim() || cert.name || 'Volunteer Certification';
    cert.description = nextDescription.trim() || cert.description || '';
    cert.updatedAt = new Date().toISOString();
    saveCerts();
    updateCertifications();
}

// Notifications
function updateNotifications() {
    const histEl = document.getElementById('notificationHistory');
    if (!histEl) return;
    histEl.innerHTML = notifications.slice(-10).reverse().map(n => `
        <div style="padding: 10px; margin: 5px 0; background: var(--glass); border-radius: 8px;">
            <strong>${n.type}</strong>: ${n.message}<br>
            <small>To: ${n.recipient}</small>
        </div>
    `).join('');
}

function sendNotification(message, type, recipient) {
    if (!message || !type || !recipient) {
        const inputMessage = document.getElementById('notificationMessage')?.value?.trim();
        const inputType = document.getElementById('notificationType')?.value || 'application';
        if (!inputMessage) {
            alert('Please enter a notification message.');
            return;
        }
        const approvedEmails = users
            .filter((u) => normalizeStatus(u.status) === 'approved' && u.email)
            .map((u) => u.email);
        if (approvedEmails.length === 0) {
            alert('No approved users available to notify.');
            return;
        }
        message = inputMessage;
        type = inputType;
        recipient = approvedEmails;
    }

    const notification = {
        id: Date.now(),
        message,
        type,
        recipient: Array.isArray(recipient) ? recipient.join(', ') : recipient,
        timestamp: new Date().toISOString()
    };
    notifications.push(notification);
    saveNotifications();
    updateNotifications();
    console.log(`Notification sent: ${message} to ${notification.recipient}`);
    alert(`Notification sent to ${notification.recipient}`);
}

// Logout
async function logoutAdmin() {
    sessionStorage.removeItem('adminAuth');
    window.location.href = 'admin-login.html';
}

async function loadAdminSession() {
    // Auth is handled by the inline script in admin.html via onAuthStateChanged.
    // If we reach here, the user is already verified — just render the shell.
    renderAdminShell();
    restoreActiveTab();
    // Fetch live skills from Firestore
    fetchAndRenderSkills().catch(e => console.error('[admin] skills fetch error:', e));
}

// Attachment preview behavior (called once after admin shell loads)
function initAdminAttachmentPreview() {
        const attachmentInput = document.getElementById('taskAttachments');
        if (attachmentInput) {
            attachmentInput.addEventListener('change', async () => {
                try {
                    const atts = await getAttachmentsFromInput();
                    renderTaskAttachmentPreview(atts);
                } catch (err) {
                    console.warn(err);
                    renderTaskAttachmentPreview([]);
                }
            });
        }
}

// Export all admin functions to window for onclick handlers
window.logoutAdmin = logoutAdmin;
window.showTab = showTab;
window.filterPrograms = filterPrograms;
window.addSkill = addSkill;
window.editSkill = editSkill;
window.deleteSkill = deleteSkill;

/* ── Inline program creation from Settings tab ── */
window.submitNewProgram = async function() {
    const name    = (document.getElementById('newProgName')?.value || '').trim();
    const desc    = (document.getElementById('newProgDesc')?.value || '').trim();
    const hours   = parseInt(document.getElementById('newProgHours')?.value || '');
    const maxVol  = parseInt(document.getElementById('newProgMax')?.value || '0') || 10;
    const req     = document.getElementById('newProgReq')?.value || 'None';
    const errEl   = document.getElementById('addProgramError');
    const btn     = document.getElementById('addProgramSubmitBtn');

    if (errEl) errEl.style.display = 'none';

    if (!name || !desc || isNaN(hours) || hours <= 0) {
        if (errEl) { errEl.textContent = 'Please fill in Name, Description and Hours.'; errEl.style.display = 'block'; }
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Syncing with Cloud...'; }

    try {
        await addDoc(collection(db, 'programs'), {
            name, title: name, desc, hours,
            requirement: req, maxVolunteers: maxVol,
            status: 'active', joined: [], pendingJoins: [], assigned: [],
            image: '', createdAt: new Date().toISOString()
        });
        logAction('program_add', `Created program: "${name}" (${hours} hours)`, { hours });

        // Reset form and hide it
        document.getElementById('newProgName').value  = '';
        document.getElementById('newProgDesc').value  = '';
        document.getElementById('newProgHours').value = '';
        document.getElementById('newProgMax').value   = '';
        document.getElementById('newProgReq').value   = 'None';
        document.getElementById('addProgramForm').style.display = 'none';
        const toggleBtn = document.getElementById('toggleAddProgramForm');
        if (toggleBtn) toggleBtn.textContent = '+ Add New Program';

        // Force immediate UI update
        updatePrograms();

    } catch (err) {
        console.error('submitNewProgram error:', err);
        if (errEl) { errEl.textContent = 'Failed: ' + (err.message || err); errEl.style.display = 'block'; }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save Program'; }
    }
};

function showTaskModal() {
    console.warn('showTaskModal() is not implemented in this build.');
}

function closeTaskModal() {
    console.warn('closeTaskModal() is not implemented in this build.');
}

function saveTask() {
    console.warn('saveTask() is not implemented in this build.');
}

function editTask() {
    console.warn('editTask() is not implemented in this build.');
}

function archiveTask() {
    console.warn('archiveTask() is not implemented in this build.');
}

function deleteTask() {
    console.warn('deleteTask() is not implemented in this build.');
}

// ===== LOGGING SYSTEM =====
let allLogs = JSON.parse(localStorage.getItem('itanimAdminLogs') || '[]');

async function logAction(actionType, actionDetail, metadata = {}) {
    const logEntry = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actionType,
        actionDetail,
        userId: auth.currentUser?.uid || 'system',
        userEmail: auth.currentUser?.email || 'system',
        metadata
    };

    allLogs.unshift(logEntry); // Add to beginning for most recent first
    if (allLogs.length > 10000) allLogs.pop(); // Keep last 10000 logs

    localStorage.setItem('itanimAdminLogs', JSON.stringify(allLogs));

    // Also save to Firestore
    if (useFirestore) {
        try {
            const logsRef = collection(db, 'admin_logs');
            await addDoc(logsRef, logEntry);
        } catch (err) {
            console.warn('Could not save log to Firestore', err);
        }
    }

    console.log(`[LOG] ${actionType}: ${actionDetail}`, metadata);
}

function filterLogs(searchTerm = '', filterType = '') {
    return allLogs.filter(log => {
        const matchesSearch = !searchTerm || 
            log.actionType.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.actionDetail.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.userEmail.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesType = !filterType || log.actionType === filterType;
        
        return matchesSearch && matchesType;
    });
}

window.clearAllLogs = () => {
    if (confirm('Are you sure you want to delete all logs? This cannot be undone.')) {
        allLogs = [];
        localStorage.setItem('itanimAdminLogs', JSON.stringify(allLogs));
        renderLogs();
        alert('All logs cleared.');
    }
};

window.exportLogs = () => {
    const logsText = allLogs.map(log => 
        `[${log.timestamp}] ${log.actionType}: ${log.actionDetail} (${log.userEmail})`
    ).join('\n');
    
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
};

function renderLogs() {
    const searchTerm = document.getElementById('logSearchInput')?.value || '';
    const filterType = document.getElementById('logFilterType')?.value || '';
    
    const filteredLogs = filterLogs(searchTerm, filterType);
    const logsList = document.getElementById('logsList');

    if (!logsList) return;

    if (filteredLogs.length === 0) {
        logsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No logs found</div>';
        return;
    }

    logsList.innerHTML = filteredLogs.map(log => {
        const date = new Date(log.timestamp);
        const timeStr = date.toLocaleTimeString();
        const dateStr = date.toLocaleDateString();
        
        let actionColor = '#546B41'; // default green
        if (log.actionType.includes('error') || log.actionType.includes('reject')) actionColor = '#d9534f'; // red
        if (log.actionType.includes('approve')) actionColor = '#5cb85c'; // green
        if (log.actionType.includes('warning')) actionColor = '#f0ad4e'; // orange

        return `
            <div style="padding: 12px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: start; gap: 10px;">
                <div style="flex: 1;">
                    <div style="font-weight: bold; color: ${actionColor};">${log.actionType}</div>
                    <div style="color: #333; margin: 4px 0;">${log.actionDetail}</div>
                    <div style="font-size: 12px; color: #999;">
                        ${dateStr} ${timeStr} • ${log.userEmail}
                    </div>
                    ${Object.keys(log.metadata).length > 0 ? `
                        <div style="font-size: 12px; color: #666; margin-top: 4px;">
                            <strong>Metadata:</strong> ${JSON.stringify(log.metadata)}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

window.renderLogs = renderLogs;

// Initialize logs search and filter listeners
document.addEventListener('DOMContentLoaded', () => {
    const logSearch = document.getElementById('logSearchInput');
    const logFilter = document.getElementById('logFilterType');

    if (logSearch) {
        logSearch.addEventListener('input', renderLogs);
    }
    if (logFilter) {
        logFilter.addEventListener('change', renderLogs);
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Hard fallback: if auth gate is still showing after 2s, reveal anyway
    setTimeout(() => {
        if (document.body.classList.contains('auth-pending')) {
            console.warn('[admin] Auth gate fallback triggered after 2s');
            revealApp();
        }
    }, 2000);
    loadAdminSession();
});

// Keep Admin UI in sync when another page updates localStorage
// (e.g., index add program, user join request) in localhost mode.
window.addEventListener('storage', (event) => {
    if (useFirestore) return;
    if (event.key === 'itanimPrograms' || event.key === 'itanimUsers') {
        try {
            programs = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
            users = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
        } catch {
            programs = [];
            users = [];
        }
        updateDashboard();
        updateAnalytics();
        updatePrograms();
        updateVolunteers();
        updateVolunteerProgramFilter();
        updateVolunteerProgramParticipants();
        updateAttendanceProgramOptions();
    }
});

window.saveRestrictionsFromUI = saveRestrictionsFromUI;
window.showTaskModal = showTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTask = saveTask;
window.editTask = editTask;
window.archiveTask = archiveTask;
window.deleteTask = deleteTask;
window.approveUser = approveUser;
window.rejectUser = rejectUser;
window.updateBadgeThresholds = updateBadgeThresholds;
window.approveCert = approveCert;
window.rejectCert = rejectCert;
window.cancelCert = cancelCert;
window.editCert = editCert;
window.sendNotification = sendNotification;
window.updateRestrictions = saveRestrictionsFromUI;
window.showProgramModal = showProgramModal;
window.closeProgramModal = closeProgramModal;
window.saveProgram = saveProgram;
window.editProgram = editProgram;
window.archiveProgram = archiveProgram;
window.deleteProgram = deleteProgram;
window.approveProgram = approveProgram;
window.rejectProgram = rejectProgram;

window.debugAuthState = () => {
    console.log("=== ADMIN AUTH DEBUG ===");
    console.log("auth.currentUser:", auth.currentUser);
    console.log("useFirestore:", useFirestore);
    console.log("Firebase config projectId:", firebaseConfig.projectId);
    console.log("========================");
    alert(`Auth: ${auth.currentUser ? 'Logged in as ' + auth.currentUser.email : 'Not logged in'}\nFirestore: ${useFirestore ? 'Enabled' : 'Disabled'}`);
};
