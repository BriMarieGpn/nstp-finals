import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { updatePassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, updateDoc, arrayUnion, setDoc, getDoc, query, where, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
const adminStateDoc = doc(db, 'admin', 'state');
const programsCollection = collection(db, 'programs');
let currentUserId = null;
let currentUserProfile = null;
let hasResolvedAuth = false;
let listenersInitialized = false;
let userProfileListenerUnsubscribe = null;

const ROLE_CACHE_KEY = 'growsauyouRoleCache';
const PROFILE_CACHE_KEY = 'growsauyouProfileCache';

function normalizeRole(role) {
    return String(role || '').toLowerCase().trim();
}

function revealApp() {
    document.body.classList.remove('auth-pending');
}

function redirectOnce(path) {
    if (hasResolvedAuth) return;
    hasResolvedAuth = true;
    window.location.href = path;
}

function getCachedProfileForUser(uid) {
    try {
        const raw = localStorage.getItem(PROFILE_CACHE_KEY);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        return cached && cached.id === uid ? cached : null;
    } catch {
        return null;
    }
}

function cacheUserProfile(profile) {
    try {
        if (!profile || !profile.id) return;
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
        localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ uid: profile.id, role: normalizeRole(profile.role || 'user') }));
    } catch {
        // ignore cache failures
    }
}

function getCachedRoleForUser(uid) {
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

function isAdminEmail(email) {
    const val = String(email || '').toLowerCase();
    // Lightweight fallback: treat emails containing "admin" as admin accounts.
    return val.includes('admin');
}

let users = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
let programs = [];

let badges = JSON.parse(localStorage.getItem('badges') || '[]');
let certifications = JSON.parse(localStorage.getItem('itanimCerts') || localStorage.getItem('certifications') || '[]');
let notifications = JSON.parse(localStorage.getItem('itanimNotifications') || localStorage.getItem('notifications') || '[]');

// Activity logging for user actions
function logUserActivity(actionType, actionDetail, metadata = {}) {
    try {
        const logEntry = {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            actionType,
            actionDetail,
            userId: auth.currentUser?.uid || currentUserId || 'unknown',
            userEmail: auth.currentUser?.email || currentUserProfile?.email || 'unknown',
            metadata
        };

        let logs = JSON.parse(localStorage.getItem('itanimAdminLogs') || '[]');
        logs.unshift(logEntry);
        if (logs.length > 10000) logs.pop();
        localStorage.setItem('itanimAdminLogs', JSON.stringify(logs));

        console.log(`[USER ACTIVITY] ${actionType}: ${actionDetail}`, metadata);
    } catch (err) {
        console.warn('Could not log user activity', err);
    }
}

async function fetchCurrentUserProfile(uid, email) {
    let profile = null;

    if (useFirestore) {
        try {
            let userDoc = await getDoc(doc(db, 'volunteers', uid));
            if (!userDoc.exists() && email) {
                const fallbackQuery = query(collection(db, 'volunteers'), where('email', '==', email));
                const fallbackSnap = await getDocs(fallbackQuery);
                if (!fallbackSnap.empty) {
                    userDoc = fallbackSnap.docs[0];
                }
            }
            if (userDoc.exists()) {
                profile = userDoc.data();
                profile.id = userDoc.id;
                profile.name = profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.email || 'Volunteer';
                profile.enrolledPrograms = profile.enrolledPrograms || [];
                profile.hours = profile.hours || 0;
                profile.badges = Array.isArray(profile.badges) ? profile.badges : (profile.badge ? [profile.badge] : []);
                profile.certifications = profile.certifications || [];
                profile.skills = profile.skills || [];
                
                // Load user status from admin state
                try {
                    const adminStateDoc = await getDoc(doc(db, 'admin', 'state'));
                    if (adminStateDoc.exists()) {
                        const adminData = adminStateDoc.data();
                        const adminUser = Array.isArray(adminData.users) ? adminData.users.find(u => u.id === uid || u.email === email) : null;
                        if (adminUser) {
                            profile = mergeAdminUserState(profile, adminUser);
                        }
                    }
                } catch (err) {
                    console.warn('Could not load user status from admin state', err);
                }
            }
        } catch (err) {
            console.warn('Could not load volunteer profile from Firestore', err);
        }
    }

    if (!profile) {
        if (!useFirestore) {
            const storedUsers = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
            const storedUser = storedUsers.find(u => u.id === uid) || storedUsers[0];
            if (storedUser) {
                profile = storedUser;
            }
        }
        if (!profile) {
            profile = {
                id: uid,
                name: 'Volunteer',
                email: email || '',
                enrolledPrograms: [],
                completedPrograms: [],
                pendingValidation: [],
                absentPrograms: [],
                hours: 0,
                badges: [],
                certifications: [],
                skills: [],
                status: 'pending',
                role: 'user'
            };
        }
    }

    return profile;
}

async function listenForUserProfileChanges(uid) {
    if (!useFirestore || userProfileListenerUnsubscribe) return;
    
    try {
        const userDocRef = doc(db, 'volunteers', uid);
        userProfileListenerUnsubscribe = onSnapshot(userDocRef, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                const updatedProfile = docSnapshot.data();
                updatedProfile.id = docSnapshot.id;
                updatedProfile.name = updatedProfile.name || `${updatedProfile.firstName || ''} ${updatedProfile.lastName || ''}`.trim() || updatedProfile.email || 'Volunteer';
                updatedProfile.enrolledPrograms = updatedProfile.enrolledPrograms || [];
                updatedProfile.hours = updatedProfile.hours || 0;
                updatedProfile.badges = Array.isArray(updatedProfile.badges) ? updatedProfile.badges : (updatedProfile.badge ? [updatedProfile.badge] : []);
                updatedProfile.certifications = updatedProfile.certifications || [];
                updatedProfile.skills = updatedProfile.skills || [];
                
                // Load user status from admin state
                try {
                    const adminStateDoc = await getDoc(doc(db, 'admin', 'state'));
                    if (adminStateDoc.exists()) {
                        const adminData = adminStateDoc.data();
                        const adminUser = Array.isArray(adminData.users) ? adminData.users.find(u => u.id === docSnapshot.id || u.email === updatedProfile.email) : null;
                        if (adminUser) {
                            updatedProfile = mergeAdminUserState(updatedProfile, adminUser);
                        }
                    }
                } catch (err) {
                    console.warn('Could not load user status from admin state in listener', err);
                }
                
                // Update current user profile
                currentUserProfile = updatedProfile;
                cacheUserProfile(updatedProfile);
                
                // Refresh dashboard to reflect changes
                loadUserDashboard();
                
                console.log('User profile updated from Firestore');
            }
        });
    } catch (err) {
        console.warn('Could not set up user profile listener', err);
    }
}

function normalizeProgram(program) {
    return {
        ...program,
        id: program.id,
        title: program.title || program.name || 'Untitled Program',
        description: program.description || program.desc || 'No description available.',
        date: program.date || 'TBD',
        location: program.location || 'Community Area',
        duration: Number(program.duration ?? program.hours ?? 0),
        hours: Number(program.hours ?? program.duration ?? 0),
        joined: Array.isArray(program.joined) ? program.joined : [],
        assigned: Array.isArray(program.assigned) ? program.assigned : []
    };
}

function mergeAdminUserState(profile, adminUser) {
    if (!profile || !adminUser) return profile;
    profile.enrolledPrograms = Array.isArray(adminUser.enrolledPrograms) ? adminUser.enrolledPrograms : Array.isArray(profile.enrolledPrograms) ? profile.enrolledPrograms : [];
    profile.completedPrograms = Array.isArray(adminUser.completedPrograms) ? adminUser.completedPrograms : Array.isArray(profile.completedPrograms) ? profile.completedPrograms : [];
    profile.pendingValidation = Array.isArray(adminUser.pendingValidation) ? adminUser.pendingValidation : Array.isArray(profile.pendingValidation) ? profile.pendingValidation : [];
    profile.absentPrograms = Array.isArray(adminUser.absentPrograms) ? adminUser.absentPrograms : Array.isArray(profile.absentPrograms) ? profile.absentPrograms : [];
    profile.hours = Number(profile.hours || adminUser.hours || 0);
    profile.badges = Array.isArray(profile.badges) ? profile.badges : (profile.badge ? [profile.badge] : []);
    profile.certifications = Array.isArray(profile.certifications) ? profile.certifications : [];
    profile.skills = Array.isArray(profile.skills) ? profile.skills : [];
    profile.status = adminUser.status || profile.status || 'pending';
    profile.role = adminUser.role || profile.role || 'user';
    return profile;
}

function getUserBadgeCount(user) {
    if (Array.isArray(user.badges) && user.badges.length > 0) return user.badges.length;
    if (user.badge && user.badge !== 'None') return 1;
    return 0;
}

function getUserCertificationCount(user) {
    const approvedCerts = certifications.filter((cert) => cert.userId === user.id && cert.status === 'approved');
    if (approvedCerts.length > 0) return approvedCerts.length;
    return Array.isArray(user.certifications) ? user.certifications.length : 0;
}

function getCertificationEligibility(user) {
    const completedPrograms = Array.isArray(user.completedPrograms) ? user.completedPrograms.length : 0;
    const hours = Number(user.hours || 0);
    return {
        eligible: hours > 0 && completedPrograms > 0,
        hours,
        completedPrograms
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

function getCurrentUser() {
    if (currentUserProfile) {
        return currentUserProfile;
    }
    const storedUsers = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
    const fallbackUser = storedUsers.find(u => u.id === currentUserId) || storedUsers[0];
    if (fallbackUser) {
        return fallbackUser;
    }
    return {
        id: currentUserId || 'user1',
        name: 'Volunteer',
        email: '',
        enrolledPrograms: [],
        completedPrograms: [],
        pendingValidation: [],
        absentPrograms: [],
        hours: 0,
        badges: [],
        certifications: [],
        skills: [],
        status: 'pending',
        role: 'user'
    };
}

document.addEventListener('DOMContentLoaded', function() {
    onAuthStateChanged(auth, async (user) => {
        let revealFallbackTimer = null;
        try {
            if (!user) {
                redirectOnce('login.html');
                return;
            }

            currentUserId = user.uid;

            // Fail-safe to prevent the auth loading gate from getting stuck.
            revealFallbackTimer = setTimeout(() => {
                revealApp();
            }, 3000);

            const cachedRole = getCachedRoleForUser(user.uid);
            if (cachedRole === 'admin' || isAdminEmail(user.email)) {
                redirectOnce('admin.html');
                return;
            }

            const cachedProfile = getCachedProfileForUser(user.uid);
            if (cachedProfile) {
                currentUserProfile = cachedProfile;
                if (normalizeRole(currentUserProfile.role) === 'admin') {
                    redirectOnce('admin.html');
                    return;
                }
                loadUserDashboard();
                if (useFirestore) {
                    listenForUserProfileChanges(user.uid);
                }
                revealApp();
            }

            currentUserProfile = await fetchCurrentUserProfile(user.uid, user.email);
            cacheUserProfile(currentUserProfile);

            if (useFirestore) {
                listenForUserProfileChanges(user.uid);
            }

            if (normalizeRole(currentUserProfile.role) === 'admin' || isAdminEmail(user.email)) {
                redirectOnce('admin.html');
                return;
            }

            if (!listenersInitialized) {
                listenersInitialized = true;
                if (useFirestore) {
                    initFirestoreUserState();
                    listenFirestorePrograms();
                    listenFirestoreCertificates();
                } else {
                    programs = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
                    loadUserDashboard();
                }
            }
            revealApp();
            hasResolvedAuth = true;
        } catch (err) {
            console.warn('User auth gate fallback triggered due to runtime error', err);
            revealApp();
        } finally {
            if (revealFallbackTimer) {
                clearTimeout(revealFallbackTimer);
            }
        }
    });
});

async function initFirestoreUserState() {
    try {
        onSnapshot(adminStateDoc, (snapshot) => {
            if (!snapshot.exists()) {
                console.warn('Firestore user state not found, clearing stale cached state');
                users = [];
                programs = [];
                badges = [];
                certifications = [];
                notifications = [];
                localStorage.removeItem('itanimUsers');
                localStorage.removeItem('users');
                localStorage.removeItem('itanimPrograms');
                localStorage.removeItem('programs');
                localStorage.removeItem('itanimCerts');
                localStorage.removeItem('certifications');
                localStorage.removeItem('badges');
                localStorage.removeItem('itanimNotifications');
                localStorage.removeItem('notifications');
                loadUserDashboard();
                return;
            }
            const state = snapshot.data();
            users = Array.isArray(state.users) ? state.users : users;
            programs = Array.isArray(state.programs) ? state.programs.map(normalizeProgram) : programs;
            badges = Array.isArray(state.badges) ? state.badges : badges;
            certifications = Array.isArray(state.certifications) ? state.certifications : certifications;
            notifications = Array.isArray(state.notifications) ? state.notifications : notifications;
            loadUserDashboard();
        });
    } catch (err) {
        console.warn('Could not connect to Firestore user state', err);
        loadUserDashboard();
    }
}

async function listenFirestorePrograms() {
    try {
        onSnapshot(programsCollection, (snapshot) => {
            programs = [];
            snapshot.forEach((docSnapshot) => {
                programs.push(normalizeProgram({ id: docSnapshot.id, ...docSnapshot.data() }));
            });
            // Keep localhost fallback cache in sync for quick rendering and tab reloads.
            try {
                const localPrograms = programs.map((p) => ({
                    id: p.id,
                    name: p.title || p.name || '',
                    desc: p.description || p.desc || '',
                    hours: Number(p.hours || p.duration || 0),
                    requirement: p.requirement || 'None',
                    maxVolunteers: Number(p.maxVolunteers || 0),
                    joined: Array.isArray(p.joined) ? p.joined : [],
                    pendingJoins: Array.isArray(p.pendingJoins) ? p.pendingJoins : [],
                    attachments: p.image ? [{ dataUrl: p.image, name: 'image', type: 'image/jpeg' }] : []
                }));
                localStorage.setItem('itanimPrograms', JSON.stringify(localPrograms));
            } catch {
                // ignore cache failures
            }
            loadUserDashboard();
        });
    } catch (err) {
        console.warn('Could not listen to Firestore programs', err);
        loadUserDashboard();
    }
}

async function listenFirestoreCertificates() {
    try {
        const certificatesCollection = collection(db, 'certificates');
        onSnapshot(certificatesCollection, (snapshot) => {
            const newCertifications = [];
            snapshot.forEach((docSnapshot) => {
                const cert = { id: docSnapshot.id, ...docSnapshot.data() };
                // Normalize status to lowercase
                if (cert.status) {
                    cert.status = String(cert.status || '').toLowerCase().trim();
                }
                newCertifications.push(cert);
            });
            certifications = newCertifications;
            // Update localStorage cache so updates persist
            localStorage.setItem('itanimCerts', JSON.stringify(certifications));
            console.log(`📜 Real-time certifications updated:`, certifications.length, 'total records');
            certifications.forEach(c => {
                console.log(`  - ${c.userEmail || c.userId}: Status = "${c.status}"`);
            });
            loadUserDashboard();
        });
    } catch (err) {
        console.warn('Could not listen to Firestore certificates', err);
    }
}

function loadUserDashboard() {
    // Always merge with shared local cache so newest admin-created programs
    // appear quickly in user dashboard, even while Firestore listeners settle.
    try {
        const localPrograms = JSON.parse(localStorage.getItem('itanimPrograms') || '[]').map(normalizeProgram);
        if (!useFirestore) {
            programs = localPrograms;
        } else if (localPrograms.length > 0) {
            const byId = new Map();
            programs.forEach((p) => byId.set(p.id, normalizeProgram(p)));
            localPrograms.forEach((p) => {
                if (!byId.has(p.id)) byId.set(p.id, p);
            });
            programs = Array.from(byId.values());
        }
    } catch {
        if (!useFirestore) {
            programs = [];
        }
    }

    function renderUserQrCode(user) {
        const qrImage = document.getElementById('qrCodeImage');
        const qrModalImage = document.getElementById('qrModalImage');
        const qrModalDownload = document.getElementById('qrModalDownload');
        if (!qrImage) return;

        const registryId = user.volunteerID || ('GRW-' + String(user.id || '').substring(0, 5).toUpperCase());
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(registryId)}`;

        qrImage.src = qrUrl;
        qrImage.alt = `QR code for ${registryId}`;

        if (qrModalImage) {
            qrModalImage.src = qrUrl;
            qrModalImage.alt = `QR code for ${registryId}`;
        }
        if (qrModalDownload) {
            qrModalDownload.href = qrUrl;
            qrModalDownload.setAttribute('download', `${registryId}.png`);
        }
    }

    function openQrModal() {
        const modal = document.getElementById('qrModal');
        if (!modal) return;
        modal.style.display = 'flex';
    }

    function closeQrModal() {
        const modal = document.getElementById('qrModal');
        if (!modal) return;
        modal.style.display = 'none';
    }

    window.openQrModal = openQrModal;
    window.closeQrModal = closeQrModal;

    const currentUser = getCurrentUser();

    // Update welcome message
    document.getElementById('welcomeMessage').textContent = `Welcome, ${currentUser.name}!`;
    renderUserQrCode(currentUser);

    // Update stats
    document.getElementById('totalHours').textContent = currentUser.hours || 0;
    document.getElementById('enrolledPrograms').textContent = currentUser.enrolledPrograms?.length || 0;
    document.getElementById('badgesEarned').textContent = getUserBadgeCount(currentUser);
    document.getElementById('certificationsCount').textContent = getUserCertificationCount(currentUser);

    loadAvailablePrograms(currentUser, programs);
    // Joined programs (based on enrolledPrograms)
    loadEnrolledPrograms(currentUser, programs);

    // Load user skills and controls
    loadUserSkills(currentUser);
    attachSkillControls(currentUser);
    loadSkillsIntoSelect();

    // Load user badges
    loadUserBadges(currentUser, badges);

    // Load user certifications
    loadUserCertifications(currentUser, certifications);
    populateCertificationProgramOptions(currentUser, programs);
    attachCertificationRequestControls(currentUser);

    // Load user notifications
    loadUserNotifications(currentUser, notifications);

    // Pending status banner — guide the user through QR scan assignment
    const pendingBanner = document.getElementById('pendingStatusBanner');
    if (pendingBanner) {
        const status = String(currentUser.status || '').toLowerCase().trim();
        if (status === 'pending') {
            pendingBanner.style.display = 'block';
            pendingBanner.textContent = '⏳ Your registration is pending barangay scan and assignment. Show your QR code to the admin at the barangay hall.';
        } else if (status === 'approved') {
            pendingBanner.style.display = 'block';
            pendingBanner.textContent = '✅ Your account is approved. Await your assigned program from the barangay admin after QR scan.';
        } else if (status === 'rejected') {
            pendingBanner.style.display = 'block';
            pendingBanner.textContent = '❌ Your application was rejected. Please contact the admin for more information.';
        } else {
            pendingBanner.style.display = 'none';
        }
    }

    // Auto-update badge based on current hours and admin-defined thresholds
    autoUpdateBadge(currentUser);

    // Refresh dashboard widgets (profile name, ID, badge, progress, charts)
    if (typeof window.refreshDashboardWidgets === 'function') {
        window.refreshDashboardWidgets(currentUser, programs);
    }
}

async function persistCertifications() {
    localStorage.setItem('itanimCerts', JSON.stringify(certifications));
    if (!useFirestore) return;
    try {
        await setDoc(adminStateDoc, { certifications }, { merge: true });
    } catch (err) {
        console.warn('Could not persist certifications', err);
    }
}

function populateCertificationProgramOptions(user, programsList) {
    const select = document.getElementById('certProgramSelect');
    if (!select) return;

    const completedIds = Array.isArray(user.completedPrograms) ? user.completedPrograms : [];
    const completedPrograms = programsList
        .filter(p => completedIds.includes(p.id))
        .map(normalizeProgram);

    const activeRequestProgramIds = certifications
        .filter((c) => c.userId === user.id && ['pending', 'requested', 'approved'].includes(c.status))
        .map((c) => c.programId)
        .filter(Boolean);

    select.innerHTML = '';

    if (!completedPrograms.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No completed programs yet';
        opt.disabled = true;
        opt.selected = true;
        select.appendChild(opt);
        select.disabled = true;
        return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select completed program for this certification';
    placeholder.disabled = false;
    placeholder.selected = true;
    select.appendChild(placeholder);

    let hasAvailable = false;
    completedPrograms.forEach(program => {
        const opt = document.createElement('option');
        opt.value = program.id;
        const alreadyRequested = activeRequestProgramIds.includes(program.id);
        opt.disabled = alreadyRequested;
        opt.textContent = alreadyRequested
            ? `${program.title} (already requested or approved)`
            : program.title;
        if (!alreadyRequested) hasAvailable = true;
        select.appendChild(opt);
    });

    if (!hasAvailable) {
        select.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No eligible completed programs available';
        opt.disabled = true;
        opt.selected = true;
        select.appendChild(opt);
        select.disabled = true;
    } else {
        select.disabled = false;
    }
}

function attachCertificationRequestControls(user) {
    const requestButton = document.getElementById('requestCertButton');
    if (!requestButton) return;

    const eligibility = getCertificationEligibility(user);
    const programSelect = document.getElementById('certProgramSelect');
    const hasAvailableProgram = programSelect && !programSelect.disabled && Array.from(programSelect.options).some(opt => opt.value && !opt.disabled);
    requestButton.disabled = !eligibility.eligible || !hasAvailableProgram;
    requestButton.textContent = !eligibility.eligible
        ? `Not Eligible (${eligibility.hours} hrs, ${eligibility.completedPrograms} completed)`
        : !hasAvailableProgram
            ? 'No eligible completed programs available'
            : 'Request Certification';

    requestButton.onclick = async () => {
        const reason = (document.getElementById('certRequestReason')?.value || '').trim();
        const proof = (document.getElementById('certProofDetails')?.value || '').trim();
        const programSelect = document.getElementById('certProgramSelect');
        const selectedProgramId = programSelect ? programSelect.value : '';
        const current = getCurrentUser();
        const currentEligibility = getCertificationEligibility(current);
        if (!currentEligibility.eligible) {
            alert('You are not yet eligible for certification. Complete programs and gain more hours first.');
            return;
        }
        if (!selectedProgramId) {
            alert('Please select which completed program this certification is for.');
            return;
        }
        if (!reason) {
            alert('Please provide your certification request reason.');
            return;
        }
        if (!proof || proof.length < 10) {
            alert('Please provide proof details (minimum 10 characters).');
            return;
        }

        const duplicateRequest = certifications.find((c) =>
            c.userId === current.id &&
            c.programId === selectedProgramId &&
            ['pending', 'requested', 'approved'].includes(c.status)
        );
        if (duplicateRequest) {
            alert(`You already have an active certification request for this program with status: ${duplicateRequest.status}.`);
            return;
        }

        const associatedProgram = programs.find((p) => p.id === selectedProgramId);

        const certRequest = {
            id: `cert-${Date.now()}`,
            userId: current.id,
            userEmail: current.email || '',
            programId: selectedProgramId,
            programTitle: associatedProgram ? (associatedProgram.title || associatedProgram.name || '') : '',
            status: 'requested',
            reason,
            proofDetails: proof,
            requestedAt: new Date().toISOString(),
            hoursAtRequest: Number(current.hours || 0),
            completedProgramsAtRequest: Array.isArray(current.completedPrograms) ? current.completedPrograms.length : 0,
            badgeAtRequest: current.badge || 'None'
        };

        certifications.unshift(certRequest);
        await persistCertifications();
        logUserActivity('certification_request', 'User submitted certification request', { certId: certRequest.id });
        loadUserDashboard();
        alert('Certification request submitted for admin review.');
    };
}

function loadUserSkills(user) {
    const container = document.getElementById('userSkillsList');
    const skills = user.skills || [];

    if (skills.length === 0) {
        container.innerHTML = '<p>No skills added yet.</p>';
        return;
    }

    container.innerHTML = skills.map(skill => `
        <span class="skill-pill">${skill}</span>
    `).join('');
}

// Fetch available skills from Firestore and populate the #skillSelect dropdown
// Uses onSnapshot so the list updates instantly when admin adds/removes a skill
let skillsSelectUnsubscribe = null;
function loadSkillsIntoSelect() {
    const select = document.getElementById('skillSelect');
    if (!select) return;

    const defaults = [
        'Planting & Seedling Skills',
        'Composting & Waste Management',
        'Watering & Irrigation Management',
        'Community Outreach',
        'Construction Support'
    ];

    const render = (names) => {
        const list = names.length ? names : defaults;
        const current = select.value;
        select.innerHTML = '<option value="" disabled>Select a skill to add</option>'
            + list.map(n => `<option value="${n}"${n === current ? ' selected' : ''}>${n}</option>`).join('');
        // Restore previously selected value if still in list
        if (current && list.includes(current)) select.value = current;
    };

    if (!useFirestore) {
        render([]);
        return;
    }

    // Unsubscribe any previous listener before starting a new one
    if (skillsSelectUnsubscribe) { skillsSelectUnsubscribe(); skillsSelectUnsubscribe = null; }

    try {
        skillsSelectUnsubscribe = onSnapshot(
            collection(db, 'skills'),
            (snap) => {
                const names = [];
                snap.forEach(d => names.push(d.data().name || d.id));
                names.sort();
                render(names);
            },
            (err) => {
                console.warn('[user] skills onSnapshot error, using defaults', err);
                render([]);
            }
        );
    } catch (err) {
        console.warn('[user] Could not subscribe to skills, using defaults', err);
        render([]);
    }
}

function attachSkillControls(user) {
    const addButton = document.getElementById('addSkillButton');
    if (!addButton) return;

    addButton.onclick = async () => {
        const select = document.getElementById('skillSelect');
        if (!select) return;
        const skill = select.value;
        if (!skill) return;

        const current = getCurrentUser();
        current.skills = current.skills || [];

        if (current.skills.includes(skill)) {
            alert(`Skill already added: ${skill}`);
            return;
        }

        current.skills.push(skill);
        currentUserProfile = current;

        if (useFirestore) {
            try {
                await setDoc(doc(db, 'volunteers', current.id), current, { merge: true });
            } catch (err) {
                console.error('Could not save skills to Firestore', err);
                alert('Could not update skills in Firestore.');
                return;
            }
        } else {
            const storedUsers = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
            const index = storedUsers.findIndex(u => u.id === current.id);
            if (index > -1) {
                storedUsers[index] = current;
            } else {
                storedUsers.unshift(current);
            }
            localStorage.setItem('itanimUsers', JSON.stringify(storedUsers));
            localStorage.setItem('users', JSON.stringify(storedUsers));
        }

        loadUserDashboard();
    };
}

function loadEnrolledPrograms(user, programs) {
    const container = document.getElementById('enrolledProgramsList');
    const enrolledIds = user.enrolledPrograms || [];
    const completedIds = user.completedPrograms || [];
    const pendingValidation = user.pendingValidation || [];

    if (enrolledIds.length === 0) {
        container.innerHTML = '<p>No programs joined yet.</p>';
        return;
    }

    const enrolledPrograms = programs.filter(p => enrolledIds.includes(p.id) && p.status !== 'archived').map(normalizeProgram);

    container.innerHTML = enrolledPrograms.map(program => {
        const isCompleted = completedIds.includes(program.id);
        const isPendingValidation = pendingValidation.includes(program.id);
        let statusLabel, actionBtn;

        if (isCompleted) {
            statusLabel = '<span class="status-badge status-badge--completed">Completed ✓</span>';
            const certForProgram = certifications.find(cert => 
                cert.userId === user.id && 
                cert.programId === program.id
            );
            if (certForProgram) {
                actionBtn = certForProgram.status === 'approved'
                    ? '<span class="certificate-status">Certificate Approved</span>'
                    : '<span class="certificate-status">Certificate Requested</span>';
            } else {
                actionBtn = `<button class="btn-secondary" onclick="requestCertificateForProgram('${program.id}', event)" style="margin-top:8px;font-size:0.82rem;">Request Certificate</button>`;
            }
        } else if (isPendingValidation) {
            statusLabel = '<span class="status-badge status-badge--pending">Pending Validation</span>';
            actionBtn = '';
        } else {
            statusLabel = '<span class="status-badge status-badge--inprogress">Pending Program</span>';
            actionBtn = '';
        }

        return `
        <div class="program-card" onclick="showUserProgramDetail('${program.id}', 'enrolled')">
            <img src="${program.image}" alt="${program.title}" onerror="this.src='https://via.placeholder.com/300x200?text=Program+Image'">
            <div class="program-info">
                <h3>${program.title}</h3>
                <p>${program.description}</p>
                <div class="program-meta">
                    <span>📅 ${program.date}</span>
                    <span>📍 ${program.location}</span>
                    <span>⏰ ${program.duration} hours</span>
                </div>
                <div class="program-status">${statusLabel}</div>
                ${actionBtn}
            </div>
        </div>
    `;
    }).join('');
}

function loadAvailablePrograms(user, programs) {
    const container = document.getElementById('availableProgramsList');
    container.innerHTML = `
        <div class="ud-card" style="padding:20px; border-radius:18px; background:rgba(84,107,65,0.08); border:1px solid rgba(84,107,65,0.16);">
            <span class="ud-card__label">Program Assignment</span>
            <p style="margin:12px 0 0;color:#4b5a35;opacity:0.9; line-height:1.5;">
                Programs are assigned by the barangay admin after your QR registry ID is scanned at the barangay hall.
                You will see your pending program here once it has been assigned.
            </p>
        </div>
    `;
}

async function joinProgram(programId) {
    alert('Program joining is managed by the barangay admin after QR scan. Please wait for assignment.');
    return;
}

function loadAssignedPrograms() {
    // Deprecated: "Assigned programs" was replaced by "Joined programs" view.
    // Intentionally left as a no-op to avoid runtime errors if referenced elsewhere.
    return;
}

function loadUserBadges(user, badges) {
    const container = document.getElementById('userBadgesList');
    const userBadges = badges.filter(b => user.badges?.includes(b.id));

    if (userBadges.length === 0) {
        container.innerHTML = '<p>No badges earned yet.</p>';
        return;
    }

    container.innerHTML = userBadges.map(badge => `
        <div class="badge-item">
            <div class="badge-icon">${badge.icon}</div>
            <div class="badge-info">
                <h4>${badge.name}</h4>
                <p>${badge.description}</p>
                <small>Earned on: ${badge.earnedDate || 'N/A'}</small>
            </div>
        </div>
    `).join('');
}

function loadUserCertifications(user, certifications) {
    const container = document.getElementById('userCertificationsList');
    const userCerts = certifications.filter((c) =>
        (Array.isArray(user.certifications) && user.certifications.includes(c.id)) ||
        (c.userId === user.id)
    );

    if (userCerts.length === 0) {
        container.innerHTML = '<p>No certifications yet.</p>';
        return;
    }

    container.innerHTML = userCerts.map(cert => `
        <div class="cert-item">
            <h4>${cert.name || 'Volunteer Certification'}</h4>
            <p>${cert.programTitle ? `Program: ${cert.programTitle}` : 'Program not specified.'}</p>
            <p>${cert.description || cert.reason || 'No details provided.'}</p>
            <div class="cert-meta">
                <span>Status: ${getCertificationStatusBadge(cert.status)}</span>
                <span>Requested: ${cert.requestedAt ? new Date(cert.requestedAt).toLocaleString() : 'N/A'}</span>
                <span>Issued: ${cert.issuedDate || 'N/A'}</span>
                <span>Valid until: ${cert.validUntil || 'N/A'}</span>
                ${cert.adminNote ? `<span>Admin note: ${cert.adminNote}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function loadUserNotifications(user, notifications) {
    const container = document.getElementById('userNotificationsList');
    const userNotifications = notifications.filter((n) => {
        if (!n || !n.recipient || !user.email) return false;
        const recipientText = String(n.recipient).toLowerCase();
        return recipientText.split(',').map((item) => item.trim()).includes(String(user.email).toLowerCase());
    }).slice(-5);

    if (userNotifications.length === 0) {
        container.innerHTML = '<p>No recent notifications.</p>';
        return;
    }

    container.innerHTML = userNotifications.map(notification => `
        <div class="notification-item">
            <h4>${notification.title}</h4>
            <p>${notification.message}</p>
            <small>${notification.timestamp}</small>
        </div>
    `).join('');
}

function showUserProgramDetail(programId, source) {
    const modal = document.getElementById('userProgramDetailModal');
    if (!modal) return;

    const program = normalizeProgram(programs.find(p => p.id === programId) || {});
    if (!program.id) return;

    const titleEl = document.getElementById('userProgramDetailTitle');
    const descEl = document.getElementById('userProgramDetailDesc');
    const hoursEl = document.getElementById('userProgramDetailHours');
    const dateEl = document.getElementById('userProgramDetailDate');
    const locationEl = document.getElementById('userProgramDetailLocation');
    const statusEl = document.getElementById('userProgramDetailStatus');

    if (titleEl) titleEl.textContent = program.title;
    if (descEl) descEl.textContent = program.description;
    if (hoursEl) hoursEl.textContent = program.hours || program.duration || 0;
    if (dateEl) dateEl.textContent = program.date || 'TBD';
    if (locationEl) locationEl.textContent = program.location || 'Community Area';
    if (statusEl) statusEl.textContent = source === 'joined' ? 'Joined' : 'Enrolled';

    modal.style.display = 'flex';
}

function closeUserProgramModal() {
    const modal = document.getElementById('userProgramDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function updateProgramStatus(programId, status) {
    if (useFirestore) {
        try {
            const program = programs.find(p => p.id === programId);
            if (program) {
                program.status = status;
                await setDoc(adminStateDoc, { programs }, { merge: true });
            }
            loadUserDashboard();
            alert('Program status updated!');
            return;
        } catch (err) {
            console.error('Could not update Firestore program status', err);
            alert('Could not update program status. Please try again.');
            return;
        }
    }

    const programsLocal = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
    const programIndex = programsLocal.findIndex(p => p.id === programId);

    if (programIndex !== -1) {
        programsLocal[programIndex].status = status;
        localStorage.setItem('itanimPrograms', JSON.stringify(programsLocal));
        loadUserDashboard();
        alert('Program status updated!');
    }
}

// Debug functions for testing

/* ── Task Completion Submission (User marks task as done → admin validates) ── */
async function submitTaskForValidation(programId) {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    if (String(currentUser.status || '').toLowerCase() !== 'approved') {
        alert('Your account must be approved before submitting task completions.');
        return;
    }

    const program = programs.find(p => p.id === programId);
    const programName = program ? (program.title || program.name || programId) : programId;

    if (!confirm(`Mark "${programName}" as completed and submit for admin validation?`)) return;

    // Add to pendingValidation array on the user profile
    currentUser.pendingValidation = currentUser.pendingValidation || [];
    if (currentUser.pendingValidation.includes(programId)) {
        alert('This task is already submitted for validation.');
        return;
    }
    currentUser.pendingValidation.push(programId);

    // Persist to Firestore
    if (useFirestore) {
        try {
            await updateDoc(doc(db, 'volunteers', currentUser.id), {
                pendingValidation: arrayUnion(programId)
            });
        } catch (err) {
            console.warn('Could not update Firestore pendingValidation', err);
        }
    }

    // Persist to localStorage
    try {
        const storedUsers = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
        const idx = storedUsers.findIndex(u => u.id === currentUser.id);
        if (idx !== -1) {
            storedUsers[idx].pendingValidation = currentUser.pendingValidation;
            localStorage.setItem('itanimUsers', JSON.stringify(storedUsers));
        }
    } catch(e) { /* ignore */ }

    logUserActivity('task_submit', `User submitted task for validation: "${programName}"`, { programId });
    loadUserDashboard();
    alert(`"${programName}" submitted for admin validation. You will be notified once approved.`);
}
window.submitTaskForValidation = submitTaskForValidation;

/* ── Auto-update badge based on hours and admin-defined thresholds ── */
function autoUpdateBadge(user) {
    const hours = Number(user.hours || 0);
    const thresholds = JSON.parse(localStorage.getItem('itanimBadges') || '{"bronze":10,"silver":25,"gold":50,"platinum":100}');
    let newBadge = 'None';
    if (hours >= Number(thresholds.platinum || 100)) newBadge = 'Platinum';
    else if (hours >= Number(thresholds.gold || 50))  newBadge = 'Gold';
    else if (hours >= Number(thresholds.silver || 25)) newBadge = 'Silver';
    else if (hours >= Number(thresholds.bronze || 10)) newBadge = 'Bronze';

    if (newBadge !== 'None' && user.badge !== newBadge) {
        user.badge = newBadge;
        // Persist
        if (useFirestore) {
            updateDoc(doc(db, 'volunteers', user.id), { badge: newBadge }).catch(() => {});
        }
        try {
            const storedUsers = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
            const idx = storedUsers.findIndex(u => u.id === user.id);
            if (idx !== -1) { storedUsers[idx].badge = newBadge; localStorage.setItem('itanimUsers', JSON.stringify(storedUsers)); }
        } catch(e) { /* ignore */ }
    }
}
function debugAddSampleData() {
    // Add sample user data for testing
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    if (users.length === 0) {
        users.push({
            id: 'user1',
            name: 'John Doe',
            email: 'john@example.com',
            enrolledPrograms: ['prog1'],
            hours: 25,
            skills: ['gardening', 'teamwork', 'community service'],
            badges: ['badge1'],
            certifications: ['cert1']
        });
        localStorage.setItem('users', JSON.stringify(users));
    }

    // Add sample programs
    const programs = JSON.parse(localStorage.getItem('programs') || '[]');
    if (programs.length === 0) {
        programs.push({
            id: 'prog1',
            title: 'Community Clean-up',
            description: 'Help clean local parks',
            date: '2024-05-15',
            location: 'Central Park',
            duration: 4,
            image: 'https://via.placeholder.com/300x200?text=Clean-up'
        });
        localStorage.setItem('programs', JSON.stringify(programs));
    }

    // Add sample tasks or assigned program records
    const itanimPrograms = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
    if (itanimPrograms.length === 0) {
        itanimPrograms.push({
            id: 'program1',
            title: 'Prepare materials',
            description: 'Gather cleaning supplies',
            assignedTo: 'john@example.com',
            priority: 'High',
            status: 'pending',
            dueDate: '2024-05-10'
        });
        localStorage.setItem('itanimPrograms', JSON.stringify(itanimPrograms));
    }

    // Add sample badges
    const badges = JSON.parse(localStorage.getItem('badges') || '[]');
    if (badges.length === 0) {
        badges.push({
            id: 'badge1',
            name: 'First Steps',
            description: 'Completed first program',
            icon: '🏆',
            earnedDate: '2024-05-15'
        });
        localStorage.setItem('badges', JSON.stringify(badges));
    }

    // Add sample certifications
    const certifications = JSON.parse(localStorage.getItem('certifications') || '[]');
    if (certifications.length === 0) {
        certifications.push({
            id: 'cert1',
            name: 'Community Service Certificate',
            description: 'Recognized for community contributions',
            issuedDate: '2024-05-15',
            validUntil: '2025-05-15'
        });
        localStorage.setItem('certifications', JSON.stringify(certifications));
    }

    // Add sample notifications
    const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
    if (notifications.length === 0) {
        notifications.push({
            id: 'notif1',
            title: 'Welcome!',
            message: 'Welcome to GrowsauYOU! Start by enrolling in programs.',
            recipient: 'john@example.com',
            timestamp: new Date().toLocaleString()
        });
        localStorage.setItem('notifications', JSON.stringify(notifications));
    }

    loadUserDashboard();
    alert('Sample data added!');
}

window.debugAddSampleData = debugAddSampleData;

// Logout function
window.logout = async () => {
    try {
        const userEmail = auth.currentUser?.email || 'user';
        logUserActivity('user_logout', `User logged out: ${userEmail}`, { userType: 'user' });
        await signOut(auth);
        window.location.href = "index.html";
    } catch (error) {
        console.error("Logout error:", error);
        logUserActivity('error', `Logout failed: ${error.message}`, { error: true });
        alert("Logout failed. Please try again.");
    }
};
window.loadUserDashboard = loadUserDashboard;
window.joinProgram = joinProgram;
window.requestCertificateForProgram = function(programId, event) {
    event.stopPropagation(); // Prevent opening program detail modal
    
    const program = programs.find(p => p.id === programId);
    if (!program) {
        alert('Program not found.');
        return;
    }
    
    // Create a modal for certificate request
    const modal = document.createElement('div');
    modal.className = 'cert-modal-overlay';
    modal.innerHTML = `
        <div class="cert-modal">
            <div class="cert-modal-header">
                <h3>Request Certificate</h3>
                <button class="cert-modal-close" onclick="this.closest('.cert-modal-overlay').remove()">×</button>
            </div>
            <div class="cert-modal-body">
                <p><strong>Program:</strong> ${program.title}</p>
                <div class="cert-form-group">
                    <label for="certReason">Reason for Request:</label>
                    <textarea id="certReason" rows="3" placeholder="Explain why you're requesting this certificate...">I have successfully completed the "${program.title}" program and would like to request a certificate of completion.</textarea>
                </div>
                <div class="cert-form-group">
                    <label for="certProof">Proof/Details:</label>
                    <textarea id="certProof" rows="3" placeholder="Provide details about your completion...">Completed all required tasks and activities for the ${program.title} program.</textarea>
                </div>
            </div>
            <div class="cert-modal-footer">
                <button class="btn-secondary" onclick="this.closest('.cert-modal-overlay').remove()">Cancel</button>
                <button class="btn-primary" onclick="submitCertificateRequest('${programId}', this)">Submit Request</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.body.appendChild(modal);
    
    // Focus on the reason textarea
    setTimeout(() => {
        const reasonTextarea = modal.querySelector('#certReason');
        if (reasonTextarea) reasonTextarea.focus();
    }, 100);
};

window.submitCertificateRequest = async function(programId, buttonElement) {
    const modal = buttonElement.closest('.cert-modal-overlay');
    const reason = modal.querySelector('#certReason').value.trim();
    const proof = modal.querySelector('#certProof').value.trim();
    
    if (!reason) {
        alert('Please provide a reason for your certificate request.');
        return;
    }
    
    if (!proof || proof.length < 10) {
        alert('Please provide proof details (minimum 10 characters).');
        return;
    }
    
    const current = getCurrentUser();
    const eligibility = getCertificationEligibility(current);
    if (!eligibility.eligible) {
        alert('You are not yet eligible for certification. Complete more programs and gain more hours first.');
        modal.remove();
        return;
    }

    const program = programs.find(p => p.id === programId);

    const certRequest = {
        id: `cert-${Date.now()}`,
        userId: current.id,
        userEmail: current.email || '',
        programId: programId,
        programTitle: program ? (program.title || program.name || '') : '',
        status: 'pending',
        reason,
        proofDetails: proof,
        requestedAt: new Date().toISOString(),
        hoursAtRequest: Number(current.hours || 0),
        completedProgramsAtRequest: Array.isArray(current.completedPrograms) ? current.completedPrograms.length : 0,
        badgeAtRequest: current.badge || 'None'
    };
    
    certifications.unshift(certRequest);
    
    if (useFirestore) {
        try {
            // Remove the temporary ID before saving to Firestore (it will generate a new one)
            const { id, ...certData } = certRequest;
            const docRef = await addDoc(collection(db, 'certificates'), certData);
            // Update the local copy with the actual Firestore ID
            certRequest.id = docRef.id;
            certifications[0].id = docRef.id;
            console.log(`✅ Certificate request created with ID: ${docRef.id}`);
        } catch (error) {
            console.error('Could not save certificate request to Firestore', error);
            alert('Could not submit certificate request. Please try again.');
            // Remove from local copy on error
            certifications = certifications.filter(c => c.id !== certRequest.id);
            return;
        }
    }
    
    // Save to localStorage
    localStorage.setItem('itanimCerts', JSON.stringify(certifications));
    
    logUserActivity('certificate_request', `User requested certificate for program: "${program?.title || programId}"`, { programId, certificateId: certRequest.id });
    
    alert('Certificate request submitted successfully! The admin will review your request.');
    modal.remove();
    
    // Refresh the dashboard to show updated status
    loadUserDashboard();
};
window.updateProgramStatus = updateProgramStatus;
window.showUserProgramDetail = showUserProgramDetail;
window.closeUserProgramModal = closeUserProgramModal;
window.forceSyncData = () => {
    try {
        programs = JSON.parse(localStorage.getItem('itanimPrograms') || '[]').map(normalizeProgram);
        users = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
    } catch {
        // keep previous in-memory data
    }
    loadUserDashboard();
    alert('Manual sync complete.');
};

// Cross-tab/page live sync in localhost mode:
// reflect admin/index changes to programs/users immediately.
window.addEventListener('storage', (event) => {
    if (event.key === 'itanimPrograms' || event.key === 'itanimUsers') {
        try {
            programs = JSON.parse(localStorage.getItem('itanimPrograms') || '[]').map(normalizeProgram);
            users = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
        } catch {
            // ignore parse errors and keep existing in-memory data
        }
        loadUserDashboard();
    }
});

window.changeUserPassword = async () => {
    const input = document.getElementById("newPasswordInput");
    const newPassword = input ? input.value.trim() : '';
    const user = auth.currentUser;

    if (!user) {
        alert('You must be signed in to change your password. Please log in again and try once more.');
        return;
    }
    if (!newPassword || newPassword.length < 6) {
        alert("Please enter a valid password (minimum 6 characters).");
        return;
    }

    try {
        await updatePassword(user, newPassword);
        alert("Password updated successfully!");
        if (input) input.value = "";
    } catch (error) {
        if (error.code === 'auth/requires-recent-login') {
            alert('Your session is too old to update the password securely. Please sign out and sign in again before retrying.');
        } else if (error.code === 'auth/weak-password') {
            alert('Please choose a stronger password. It must be at least 6 characters.');
        } else {
            alert("Error: " + error.message + "\nIf this issue persists, please log out and log back in first.");
        }
    }
};

// Leaderboard "See All" modal functionality
function initLeaderboardModal() {
    const seeAllLink = document.querySelector('.ud-leaderboard__seeall');
    if (!seeAllLink) return;
    
    seeAllLink.addEventListener('click', (e) => {
        e.preventDefault();
        openLeaderboardModal();
    });
}

function openLeaderboardModal() {
    const modal = document.getElementById('leaderboardModal');
    const modalList = document.getElementById('leaderboardModalList');
    if (!modal || !modalList) return;
    
    try {
        let allUsers = [];
        try { 
            allUsers = JSON.parse(localStorage.getItem('itanimUsers') || '[]'); 
        } catch(e) {}
        
        // Filter out admin accounts - only show regular user accounts
        const regularUsers = allUsers.filter(u => {
            const isAdmin = normalizeRole(u.role) === 'admin' || isAdminEmail(u.email);
            return !isAdmin;
        });
        
        // Normalize hours and sort by hours descending
        const rankedUsers = regularUsers
            .map((u) => ({ ...u, hours: Number(u.hours || 0) }))
            .sort((a, b) => b.hours - a.hours);
        
        if (rankedUsers.length === 0) {
            modalList.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.6;">No users in leaderboard yet.</div>';
        } else {
            modalList.innerHTML = rankedUsers.map((u, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '  ';
                const name = (u.fullName || u.name || u.email || 'User').trim();
                const truncatedName = name.length > 30 ? name.slice(0, 27) + '…' : name;
                return `
                    <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border);font-family:'Montserrat',sans-serif;">
                        <span style="font-size:1.2rem;min-width:24px;">${medal}</span>
                        <span style="flex:1;font-weight:500;color:var(--primary);">${truncatedName}</span>
                        <span style="opacity:0.8;">🏆 ${Number(u.hours || 0)} hrs</span>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('Error loading leaderboard modal:', err);
        modalList.innerHTML = '<div style="padding:20px;text-align:center;color:red;">Error loading leaderboard</div>';
    }
    
    modal.style.display = 'flex';
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('leaderboardModal');
    if (modal && e.target === modal) {
        modal.style.display = 'none';
    }
});

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLeaderboardModal);
} else {
    initLeaderboardModal();
}
