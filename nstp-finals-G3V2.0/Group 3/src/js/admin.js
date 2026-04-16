import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, deleteDoc, setDoc, updateDoc, onSnapshot, collection, getDocs, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
const adminStateDoc = doc(db, 'admin', 'state');

const defaultImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='280' viewBox='0 0 500 280'%3E%3Crect width='500' height='280' fill='%23546B41'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='24' fill='%23FFF8EC'%3EImage unavailable%3C/text%3E%3C/svg%3E";

// Data structures
let users = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
let programs = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
let certifications = JSON.parse(localStorage.getItem('itanimCerts') || '[]');
let skills = JSON.parse(localStorage.getItem('itanimSkills') || '[]');
let restrictions = JSON.parse(localStorage.getItem('itanimRestrictions') || '{}');
let badgeThresholds = JSON.parse(localStorage.getItem('itanimBadges') || '{}');
let notifications = JSON.parse(localStorage.getItem('itanimNotifications') || '[]');
const programsKey = "itanimLocalPrograms";


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
    if (useFirestore) {
        (async () => {
            try {
                // Delete all existing docs in programs_empty
                const snap = await getDocs(collection(db, 'programs_empty'));
                const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
                await Promise.all(deletePromises);
                // Add new ones
                const addPromises = programs.map(p => setDoc(doc(db, 'programs_empty', p.id), p));
                await Promise.all(addPromises);
            } catch (err) {
                console.warn('Could not save programs to Firestore', err);
            }
        })();
    }
    saveAdminStateToFirestore();
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
            updateDashboard();
            updateAnalytics();
            updateVolunteers();
            loadRestrictionsUI();
            updateSkills();
            updatePrograms();
            updateValidation();
            updateBadges();
            updateCertifications();
            updateNotifications();
            syncProgramsFromPrograms();
        });
    } catch (err) {
        console.warn('Firestore admin state listener failed', err);
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
        await Promise.all(programs.map(async (program) => {
            await setDoc(doc(db, 'programs_empty', program.id), {
                title: program.title,
                hours: program.hours,
                requirement: program.requirement,
                desc: program.desc,
                image: program.image,
                joined: program.joined,
                skills: program.skills,
                _source: program._source
            }, { merge: true });
        }));
    } catch (err) {
        console.warn('Could not sync programs from programs to Firestore', err);
    }
}

// Tab switching
function showTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector(`button[onclick="showTab('${tabName}')"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
    updateTab(tabName);
}

// Update tab content
function updateTab(tabName) {
    switch(tabName) {
        case 'dashboard': updateDashboard(); break;
        case 'analytics': updateAnalytics(); break;
        case 'volunteers': updateVolunteers(); break;
        case 'restrictions': updateRestrictions(); break;
        case 'skills': updateSkills(); break;
        case 'programs': updatePrograms(); break;
        case 'validation': updateValidation(); break;
        case 'badges': updateBadges(); break;
        case 'certifications': updateCertifications(); break;
        case 'notifications': updateNotifications(); break;
    }
}

// Dashboard
function updateDashboard() {
    const totalVolunteers = users.filter(u => u.status === 'approved').length;
    const pendingApps = users.filter(u => u.status === 'pending').length;
    const approvedUsers = users.filter(u => u.status === 'approved').length;
    const rejectedUsers = users.filter(u => u.status === 'rejected').length;
    const activePrograms = programs.filter(p => p.status === 'active').length;
    const completedPrograms = programs.filter(p => p.status === 'completed').length;

    document.getElementById('totalVolunteers').textContent = totalVolunteers;
    document.getElementById('pendingApps').textContent = pendingApps;
    document.getElementById('approvedUsers').textContent = approvedUsers;
    document.getElementById('rejectedUsers').textContent = rejectedUsers;
    document.getElementById('activePrograms').textContent = activePrograms;
    document.getElementById('completedPrograms').textContent = completedPrograms;
}

// Analytics
function updateAnalytics() {
    const totalHours = users.reduce((sum, u) => sum + (u.hours || 0), 0);
    const activeVolunteers = users.filter(u => u.status === 'approved' && u.hours > 0).length;
    const inactiveVolunteers = users.filter(u => u.status === 'approved' && u.hours === 0).length;
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
    document.getElementById('topTasks').innerHTML = topPrograms.map(([name, count]) => `<li>${name}: ${count} completions</li>`).join('');

    // Badge distribution
    const badges = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0, None: 0 };
    users.forEach(u => {
        badges[u.badge || 'None']++;
    });
    document.getElementById('badgeChart').innerHTML = Object.entries(badges).map(([badge, count]) => `<div>${badge}: ${count}</div>`).join('');
}

// Volunteers
function updateVolunteers() {
    const list = document.getElementById('volunteerList');
    list.innerHTML = users.map(u => `
        <div class="volunteer-item">
            <div>
                <strong>${u.name}</strong><br>
                Email: ${u.email}<br>
                Age: ${u.age}, Barangay: ${u.barangay}<br>
                Skills: ${u.skills.join(', ')}<br>
                Status: ${u.status}, Hours: ${u.hours || 0}, Badge: ${u.badge || 'None'}
            </div>
            <div>
                ${u.status === 'pending' ? `
                    <button class="approve-btn" onclick="approveUser('${u.id}')">Approve</button>
                    <button class="reject-btn" onclick="rejectUser('${u.id}')">Reject</button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function approveUser(id) {
    const user = users.find(u => u.id === id);
    if (user) {
        user.status = 'approved';
        saveUsers();
        updateVolunteers();
        sendNotification(`Your application has been approved!`, 'application', user.email);
    }
}

function rejectUser(id) {
    const user = users.find(u => u.id === id);
    if (user) {
        user.status = 'rejected';
        saveUsers();
        updateVolunteers();
        sendNotification(`Your application has been rejected.`, 'application', user.email);
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

// Skills
function updateSkills() {
    document.getElementById('skillList').innerHTML = skills.map(skill => `
        <li>${skill} <button class="delete-btn" onclick="deleteSkill('${skill}')">Delete</button></li>
    `).join('');
}

function addSkill() {
    const newSkill = document.getElementById('newSkill').value.trim();
    if (newSkill && !skills.includes(newSkill)) {
        skills.push(newSkill);
        saveSkills();
        updateSkills();
        document.getElementById('newSkill').value = '';
    }
}

function deleteSkill(skill) {
    skills = skills.filter(s => s !== skill);
    saveSkills();
    updateSkills();
}

// Programs
function updatePrograms() {
    const list = document.getElementById('programList');
    list.innerHTML = programs.map(p => `
        <div class="program-item">
            <div>
                <strong>${p.name}</strong><br>
                ${p.desc}<br>
                Hours: ${p.hours}, Requirement: ${p.requirement || 'None'}<br>
                Max Volunteers: ${p.maxVolunteers}, Assigned: ${p.assigned.length}/${p.maxVolunteers}<br>
                Status: ${p.status}
            </div>
            <div>
                <button class="edit-btn" onclick="editProgram('${p.id}')">Edit</button>
                ${p.status === 'active' ? `<button class="archive-btn" onclick="archiveProgram('${p.id}')">Archive</button>` : ''}
                <button class="delete-btn" onclick="deleteProgram('${p.id}')">Delete</button>
            </div>
        </div>
    `).join('');
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
    const name = document.getElementById('programName').value.trim();
    const desc = document.getElementById('programDesc').value.trim();
    const hours = parseInt(document.getElementById('programHours').value);
    const requirement = document.getElementById('programRequirement').value || 'None';
    const maxVol = parseInt(document.getElementById('programMaxVolunteers').value);

    if (!name || !desc || !hours || !maxVol) {
        alert('Please fill all required fields');
        return;
    }

    const modal = document.getElementById('programModal');
    const editId = modal.dataset.editId;
    const newAttachments = await getAttachmentsFromInput();

    if (editId) {
        const program = programs.find(p => p.id === editId);
        program.name = name;
        program.desc = desc;
        program.hours = hours;
        program.requirement = requirement;
        program.maxVolunteers = maxVol;
        // Only replace attachments if user selected new ones; otherwise keep existing.
        if (newAttachments.length > 0) {
            program.attachments = newAttachments;
        } else {
            program.attachments = program.attachments || [];
        }
    } else {
        const newProgram = {
            id: `program${Date.now()}`,
            name,
            desc,
            hours,
            requirement,
            maxVolunteers: maxVol,
            assigned: [],
            status: 'active',
            attachments: newAttachments
        };
        programs.push(newProgram);
    }

    savePrograms();
    syncProgramsFromPrograms();
    updatePrograms();
    closeProgramModal();
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
    programs = programs.filter(p => p.id !== id);
    savePrograms();
    await syncProgramsFromPrograms();
    if (useFirestore) {
        try {
            await deleteDoc(doc(db, 'programs_empty', id));
        } catch (err) {
            console.warn('Could not delete program document from Firestore', err);
        }
    }
    updatePrograms();
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

function approveProgram(id) {
    const program = programs.find(p => p.id === id);
    if (program) {
        program.validated = true;
        program.assigned.forEach(userId => {
            const user = users.find(u => u.id === userId);
            if (user) {
                user.hours = (user.hours || 0) + program.hours;
                updateBadge(user);
            }
        });
        saveUsers();
        savePrograms();
        updateValidation();
        sendNotification(`Program "${program.name}" has been approved! You earned ${program.hours} hours.`, 'program', program.assigned.map(id => users.find(u => u.id === id)?.email).filter(Boolean));
    }
}

function rejectProgram(id) {
    const program = programs.find(p => p.id === id);
    if (program) {
        program.status = 'active';
        program.validated = false;
        savePrograms();
        updateValidation();
        sendNotification(`Program "${program.name}" has been rejected and returned to In Progress.`, 'program', program.assigned.map(id => users.find(u => u.id === id)?.email).filter(Boolean));
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
function updateCertifications() {
    const list = document.getElementById('certRequests');
    list.innerHTML = certifications.map(c => {
        const user = users.find(u => u.id === c.userId);
        return `
            <div class="cert-item">
                <div>
                    <strong>${user?.name || 'Unknown'}</strong><br>
                    Email: ${user?.email || 'N/A'}<br>
                    Hours: ${user?.hours || 0}, Badge: ${user?.badge || 'None'}<br>
                    Status: ${c.status}
                </div>
                <div>
                    ${c.status === 'pending' ? `
                        <button class="approve-btn" onclick="approveCert('${c.id}')">Approve</button>
                        <button class="reject-btn" onclick="rejectCert('${c.id}')">Reject</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function approveCert(id) {
    const cert = certifications.find(c => c.id === id);
    if (cert) {
        cert.status = 'approved';
        saveCerts();
        updateCertifications();
        const user = users.find(u => u.id === cert.userId);
        sendNotification(`Your certification request has been approved!`, 'certification', user?.email);
    }
}

function rejectCert(id) {
    const cert = certifications.find(c => c.id === id);
    if (cert) {
        cert.status = 'rejected';
        saveCerts();
        updateCertifications();
        const user = users.find(u => u.id === cert.userId);
        sendNotification(`Your certification request has been rejected.`, 'certification', user?.email);
    }
}

// Notifications
function updateNotifications() {
    document.getElementById('notificationHistory').innerHTML = notifications.slice(-10).reverse().map(n => `
        <div style="padding: 10px; margin: 5px 0; background: var(--glass); border-radius: 8px;">
            <strong>${n.type}</strong>: ${n.message}<br>
            <small>To: ${n.recipient}</small>
        </div>
    `).join('');
}

function sendNotification(message, type, recipient) {
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
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Logout error:", error);
        alert("Logout failed. Please try again.");
    }
}

async function loadAdminSession() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        try {
            let userDoc = await getDoc(doc(db, 'volunteers', user.uid));
            if (!userDoc.exists()) {
                const fallbackQuery = query(collection(db, 'volunteers'), where('email', '==', user.email));
                const fallbackSnap = await getDocs(fallbackQuery);
                if (!fallbackSnap.empty) {
                    userDoc = fallbackSnap.docs[0];
                }
            }
            if (!userDoc.exists() || userDoc.data().role !== 'admin') {
                window.location.href = 'user.html';
                return;
            }
        } catch (err) {
            console.warn('Could not verify admin role', err);
            window.location.href = 'login.html';
            return;
        }

        updateDashboard();
        updateAnalytics();
        updateVolunteers();
        loadRestrictionsUI();
        updateSkills();
        updateTasks();
        updateValidation();
        updateBadges();
        updateCertifications();
        updateNotifications();

        // Attachment preview behavior
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

        // Ensure programs mirror is present on load
        syncProgramsFromTasks();
        initFirestoreAdminState();
    });
}

// Export all admin functions to window for onclick handlers
window.logoutAdmin = logoutAdmin;
window.showTab = showTab;

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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadAdminSession();
});

window.saveRestrictionsFromUI = saveRestrictionsFromUI;
window.addSkill = addSkill;
window.deleteSkill = deleteSkill;
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
