import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, updateDoc, arrayUnion, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
const adminStateDoc = doc(db, 'admin', 'state');
const programsCollection = collection(db, 'programs_empty');
let currentUserId = null;

let users = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
let programs = [];

// Clear any existing local programs to start fresh
localStorage.removeItem('itanimPrograms');
localStorage.removeItem('itanimTasks');
localStorage.removeItem('itanimLocalPrograms');
localStorage.removeItem('programs');

let badges = JSON.parse(localStorage.getItem('badges') || '[]');
let certifications = JSON.parse(localStorage.getItem('certifications') || '[]');
let notifications = JSON.parse(localStorage.getItem('notifications') || '[]');

function getCurrentUser() {
    if (useFirestore) {
        const user = users.find(u => u.id === currentUserId);
        if (user) return user;
    }
    const storedUsers = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
    return storedUsers[0] || { id: 'user1', name: 'Demo User', email: 'demo@example.com', enrolledPrograms: [], hours: 0, badges: [], certifications: [], skills: [] };
}

document.addEventListener('DOMContentLoaded', function() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        currentUserId = user.uid;

        if (useFirestore) {
            initFirestoreUserState();
            listenFirestorePrograms();
        } else {
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
            programs = Array.isArray(state.programs) ? state.programs : programs;
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
                programs.push({ id: docSnapshot.id, ...docSnapshot.data() });
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
    document.getElementById('badgesEarned').textContent = currentUser.badges?.length || 0;
    document.getElementById('certificationsCount').textContent = currentUser.certifications?.length || 0;

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

    // Load user notifications
    loadUserNotifications(currentUser, notifications);
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

    addButton.onclick = () => {
        const select = document.getElementById('skillSelect');
        if (!select) return;
        const skill = select.value;
        if (!skill) return;

        const storedUsers = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
        const current = storedUsers[0] || { id: 'user1', email: 'demo@example.com', skills: [] };
        current.skills = current.skills || [];

        if (current.skills.includes(skill)) {
            alert(`Skill already added: ${skill}`);
            return;
        }

        current.skills.push(skill);
        storedUsers[0] = current;
        if (useFirestore) {
            users = users.map(u => u.id === current.id ? current : u);
            await setDoc(adminStateDoc, { users }, { merge: true });
        } else {
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

    const enrolledPrograms = programs.filter(p => enrolledIds.includes(p.id));

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
    const availablePrograms = programs.filter(p => !enrolledIds.includes(p.id));

    if (availablePrograms.length === 0) {
        container.innerHTML = '<p>No available programs to join at the moment.</p>';
        return;
    }

    container.innerHTML = availablePrograms.map(program => `
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
                <div class="program-actions">
                    <button class="btn-primary" onclick="joinProgram('${program.id}')">Join</button>
                </div>
            </div>
        </div>
    `).join('');
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

    currentUser.enrolledPrograms.push(programId);
    if (useFirestore) {
        try {
            const programRef = doc(db, 'programs', programId);
            await updateDoc(programRef, {
                joined: arrayUnion(currentUser.id)
            });

            const updatedUsers = users.map(u => u.id === currentUser.id ? currentUser : u);
            users = updatedUsers;
            await setDoc(adminStateDoc, { users }, { merge: true });
        } catch (err) {
            console.error('Could not update Firestore join state', err);
            alert('Could not join this program in Firestore. Please try again.');
            return;
        }
    } else {
        const storedUsers = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
        storedUsers[0] = currentUser;
        localStorage.setItem('users', JSON.stringify(storedUsers));
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
    const userCerts = certifications.filter(c => user.certifications?.includes(c.id));

    if (userCerts.length === 0) {
        container.innerHTML = '<p>No certifications completed.</p>';
        return;
    }

    container.innerHTML = userCerts.map(cert => `
        <div class="cert-item">
            <h4>${cert.name}</h4>
            <p>${cert.description}</p>
            <div class="cert-meta">
                <span>Issued: ${cert.issuedDate || 'N/A'}</span>
                <span>Valid until: ${cert.validUntil || 'N/A'}</span>
            </div>
        </div>
    `).join('');
}

function loadUserNotifications(user, notifications) {
    const container = document.getElementById('userNotificationsList');
    const userNotifications = notifications.filter(n => n.recipient === user.email).slice(-5); // Last 5

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

    // Add sample programs
    const programs = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
    if (programs.length === 0) {
        programs.push({
            id: 'program1',
            title: 'Prepare materials',
            description: 'Gather cleaning supplies',
            assignedTo: 'john@example.com',
            priority: 'High',
            status: 'pending',
            dueDate: '2024-05-10'
        });
        localStorage.setItem('itanimPrograms', JSON.stringify(programs));
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
            message: 'Welcome to I-Tanim! Start by enrolling in programs.',
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
        await signOut(auth);
        window.location.href = "index.html";
    } catch (error) {
        console.error("Logout error:", error);
        alert("Logout failed. Please try again.");
    }
};
window.loadUserDashboard = loadUserDashboard;
window.joinProgram = joinProgram;
window.updateProgramStatus = updateProgramStatus;