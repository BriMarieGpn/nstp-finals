import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, updateDoc, arrayUnion, setDoc, getDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
const adminStateDoc = doc(db, 'admin', 'state');
const programsCollection = collection(db, 'programs_empty');
let currentUserId = null;
let currentUserProfile = null;

function normalizeRole(role) {
    return String(role || '').toLowerCase().trim();
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
            }
        } catch (err) {
            console.warn('Could not load volunteer profile from Firestore', err);
        }
    }

    if (!profile) {
        const storedUsers = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
        profile = storedUsers.find(u => u.id === uid) || storedUsers[0] || {
            id: uid,
            name: 'Volunteer',
            email: '',
            enrolledPrograms: [],
            hours: 0,
            badges: [],
            certifications: [],
            skills: []
        };
    }

    return profile;
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
        hours: 0,
        badges: [],
        certifications: [],
        skills: []
    };
}

document.addEventListener('DOMContentLoaded', function() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        currentUserId = user.uid;
        currentUserProfile = await fetchCurrentUserProfile(user.uid, user.email);

        if (normalizeRole(currentUserProfile.role) === 'admin') {
            window.location.href = 'admin.html';
            return;
        }

        if (useFirestore) {
            initFirestoreUserState();
            listenFirestorePrograms();
        } else {
            programs = JSON.parse(localStorage.getItem('itanimLocalPrograms') || '[]');
            loadUserDashboard();
        }
    });
});

async function initFirestoreUserState() {
    try {
        onSnapshot(adminStateDoc, (snapshot) => {
            if (!snapshot.exists()) {
                console.warn('Firestore user state not found, using local demo data');
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
            loadUserDashboard();
        });
    } catch (err) {
        console.warn('Could not listen to Firestore programs', err);
        loadUserDashboard();
    }
}

function loadUserDashboard() {
    const currentUser = getCurrentUser();

    // Update welcome message
    document.getElementById('welcomeMessage').textContent = `Welcome, ${currentUser.name}!`;

    // Update stats
    document.getElementById('totalHours').textContent = currentUser.hours || 0;
    document.getElementById('enrolledPrograms').textContent = currentUser.enrolledPrograms?.length || 0;
    document.getElementById('badgesEarned').textContent = getUserBadgeCount(currentUser);
    document.getElementById('certificationsCount').textContent = getUserCertificationCount(currentUser);

    // Load enrolled programs
    loadEnrolledPrograms(currentUser, programs);
    loadAvailablePrograms(currentUser, programs);

    // Load assigned programs
    loadAssignedPrograms(currentUser, programs);

    // Load user skills and controls
    loadUserSkills(currentUser);
    attachSkillControls(currentUser);

    // Load user badges
    loadUserBadges(currentUser, badges);

    // Load user certifications
    loadUserCertifications(currentUser, certifications);
    attachCertificationRequestControls(currentUser);

    // Load user notifications
    loadUserNotifications(currentUser, notifications);
}

async function persistCertifications() {
    localStorage.setItem('itanimCerts', JSON.stringify(certifications));
    if (!useFirestore) return;
    try {
        // Save each certificate to the certificates collection
        for (const cert of certifications) {
            const certRef = doc(db, 'certificates', cert.id);
            await setDoc(certRef, cert, { merge: true });
        }
    } catch (err) {
        console.warn('Could not persist certifications', err);
    }
}

function attachCertificationRequestControls(user) {
    const requestButton = document.getElementById('requestCertButton');
    if (!requestButton) return;

    const eligibility = getCertificationEligibility(user);
    requestButton.disabled = !eligibility.eligible;
    requestButton.textContent = eligibility.eligible
        ? 'Request Certification'
        : `Not Eligible (${eligibility.hours} hrs, ${eligibility.completedPrograms} completed)`;

    requestButton.onclick = async () => {
        const reason = (document.getElementById('certRequestReason')?.value || '').trim();
        const proof = (document.getElementById('certProofDetails')?.value || '').trim();
        const current = getCurrentUser();
        const currentEligibility = getCertificationEligibility(current);
        if (!currentEligibility.eligible) {
            alert('You are not yet eligible for certification. Complete programs and gain more hours first.');
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

        const latest = certifications.find((c) => c.userId === current.id && ['pending', 'requested', 'approved'].includes(c.status));
        if (latest) {
            alert(`You already have an active certification status: ${latest.status}.`);
            return;
        }

        const certRequest = {
            id: `cert-${Date.now()}`,
            userId: current.id,
            userEmail: current.email || '',
            status: 'pending',
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

    if (enrolledIds.length === 0) {
        container.innerHTML = '<p>No programs enrolled yet.</p>';
        return;
    }

    const enrolledPrograms = programs.filter(p => enrolledIds.includes(p.id)).map(normalizeProgram);

    container.innerHTML = enrolledPrograms.map(program => `
        <div class="program-card">
            <img src="${program.image}" alt="${program.title}" onerror="this.src='https://via.placeholder.com/300x200?text=Program+Image'">
            <div class="program-info">
                <h3>${program.title}</h3>
                <p>${program.description}</p>
                <div class="program-meta">
                    <span>📅 ${program.date}</span>
                    <span>📍 ${program.location}</span>
                    <span>⏰ ${program.duration} hours</span>
                </div>
                <div class="program-status">
                    <span class="status enrolled">Enrolled</span>
                </div>
            </div>
        </div>
    `).join('');
}

function loadAvailablePrograms(user, programs) {
    const container = document.getElementById('availableProgramsList');
    const enrolledIds = user.enrolledPrograms || [];
    const availablePrograms = programs.filter(p => !enrolledIds.includes(p.id)).map(normalizeProgram);

    if (availablePrograms.length === 0) {
        container.innerHTML = '<p>No available programs to join at the moment.</p>';
        return;
    }

    container.innerHTML = availablePrograms.map(program => {
        const joinedCount = Array.isArray(program.joined) ? program.joined.length : 0;
        const maxVolunteers = Number(program.maxVolunteers || 0);
        const isFull = maxVolunteers > 0 && joinedCount >= maxVolunteers;
        return `
        <div class="program-card">
            <img src="${program.image}" alt="${program.title}" onerror="this.src='https://via.placeholder.com/300x200?text=Program+Image'">
            <div class="program-info">
                <h3>${program.title}</h3>
                <p>${program.description}</p>
                <div class="program-meta">
                    <span>📅 ${program.date}</span>
                    <span>📍 ${program.location}</span>
                    <span>⏰ ${program.duration} hours</span>
                    <span>👥 ${joinedCount}${maxVolunteers > 0 ? `/${maxVolunteers}` : ''}</span>
                </div>
                <div class="program-actions">
                    <button class="btn-primary" onclick="joinProgram('${program.id}')" ${isFull ? 'disabled' : ''}>
                        ${isFull ? 'Unavailable (Full)' : 'Join'}
                    </button>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

async function joinProgram(programId) {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        alert('No registered user found. Please sign in to join programs.');
        return;
    }

    currentUser.enrolledPrograms = currentUser.enrolledPrograms || [];
    if (currentUser.enrolledPrograms.includes(programId)) {
        alert('You have already joined this program.');
        return;
    }

    const selectedProgram = normalizeProgram(programs.find((p) => p.id === programId) || {});
    const joinedCount = Array.isArray(selectedProgram?.joined) ? selectedProgram.joined.length : 0;
    const maxVolunteers = Number(selectedProgram?.maxVolunteers || 0);
    if (maxVolunteers > 0 && joinedCount >= maxVolunteers) {
        alert('This program is already full and unavailable.');
        return;
    }

    currentUser.enrolledPrograms.push(programId);
    const programName = programs.find(p => p.id === programId)?.title || `Program ${programId}`;
    
    if (useFirestore) {
        try {
            const programRef = doc(db, 'programs_empty', programId);
            await updateDoc(programRef, {
                joined: arrayUnion(currentUser.id)
            });

            await setDoc(doc(db, 'volunteers', currentUser.id), {
                enrolledPrograms: currentUser.enrolledPrograms
            }, { merge: true });
            
            logUserActivity('volunteer_join', `User joined program: "${programName}"`, { programId, userName: currentUser.name });
            loadUserDashboard();
        } catch (err) {
            console.error('Could not update Firestore join state', err);
            logUserActivity('error', `Failed to join program: "${programName}" - ${err.message}`, { error: true });
            alert('Could not join this program in Firestore. Please try again.');
            return;
        }
    } else {
        const storedUsers = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
        const index = storedUsers.findIndex(u => u.id === currentUser.id);
        if (index > -1) {
            storedUsers[index] = currentUser;
        } else {
            storedUsers.push(currentUser);
        }
        localStorage.setItem('users', JSON.stringify(storedUsers));
        localStorage.setItem('itanimUsers', JSON.stringify(storedUsers));
        logUserActivity('volunteer_join', `User joined program: "${programName}"`, { programId, userName: currentUser.name });
    }

    loadUserDashboard();
    alert('You have joined the program successfully!');
}


function loadAssignedPrograms(user, programs) {
    const container = document.getElementById('assignedProgramsList');
    const userId = user.id || user.email;
    const userEmail = user.email;
    const userPrograms = programs.filter(p => {
        if (p.assignedTo) return p.assignedTo === userEmail;
        if (Array.isArray(p.assigned)) return p.assigned.includes(userId);
        return false;
    });

    if (userPrograms.length === 0) {
        container.innerHTML = '<p>No programs assigned.</p>';
        return;
    }

    container.innerHTML = userPrograms.map(program => `
        <div class="program-item">
            <h4>${program.title || program.name}</h4>
            <p>${program.description || program.desc}</p>
            <div class="program-meta">
                <span>Status: ${program.status || 'active'}</span>
                <span>Hours: ${program.hours ?? ''}</span>
            </div>
            <div class="program-actions">
                <button onclick="updateProgramStatus('${program.id}', 'completed')" class="btn-primary">Mark Complete</button>
            </div>
        </div>
    `).join('');
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
            <p>${cert.description || cert.reason || 'No details provided.'}</p>
            <div class="cert-meta">
                <span>Status: ${getCertificationStatusBadge(cert.status)}</span>
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
window.updateProgramStatus = updateProgramStatus;