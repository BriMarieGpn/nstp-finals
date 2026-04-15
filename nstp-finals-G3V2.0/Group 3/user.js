// User Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
    loadUserDashboard();
});

function loadUserDashboard() {
    // Load data from localStorage (support both legacy and admin keys)
    const users = JSON.parse(localStorage.getItem('itanimUsers') || localStorage.getItem('users') || '[]');
    const tasks = JSON.parse(localStorage.getItem('itanimTasks') || localStorage.getItem('tasks') || '[]');
    const badges = JSON.parse(localStorage.getItem('badges') || '[]');
    const certifications = JSON.parse(localStorage.getItem('certifications') || '[]');
    const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
    const programs = JSON.parse(localStorage.getItem('itanimLocalPrograms') || localStorage.getItem('programs') || '[]');

    // Get current user (assuming first user for demo, or from session)
    const currentUser = users[0] || { name: 'Demo User', email: 'demo@example.com', enrolledPrograms: [], hours: 0, badges: [], certifications: [] };

    // Update welcome message
    document.getElementById('welcomeMessage').textContent = `Welcome, ${currentUser.name}!`;

    // Update stats
    document.getElementById('totalHours').textContent = currentUser.hours || 0;
    document.getElementById('enrolledPrograms').textContent = currentUser.enrolledPrograms?.length || 0;
    document.getElementById('badgesEarned').textContent = currentUser.badges?.length || 0;
    document.getElementById('certificationsCount').textContent = currentUser.certifications?.length || 0;

    // Load enrolled programs
    loadEnrolledPrograms(currentUser, programs);

    // Load assigned tasks
    loadAssignedTasks(currentUser, tasks);

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

        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const current = users[0] || { id: 'user1', email: 'demo@example.com', skills: [] };
        current.skills = current.skills || [];

        if (current.skills.includes(skill)) {
            alert(`Skill already added: ${skill}`);
            return;
        }

        current.skills.push(skill);
        users[0] = current;
        localStorage.setItem('users', JSON.stringify(users));
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

function loadAssignedTasks(user, tasks) {
    const container = document.getElementById('assignedTasksList');
    const userId = user.id || user.email;
    const userEmail = user.email;
    const userTasks = tasks.filter(t => {
        if (t.assignedTo) return t.assignedTo === userEmail;
        if (Array.isArray(t.assigned)) return t.assigned.includes(userId);
        return false;
    });

    if (userTasks.length === 0) {
        container.innerHTML = '<p>No tasks assigned.</p>';
        return;
    }

    container.innerHTML = userTasks.map(task => `
        <div class="task-item">
            <h4>${task.title || task.name}</h4>
            <p>${task.description || task.desc}</p>
            <div class="task-meta">
                <span>Status: ${task.status || 'active'}</span>
                <span>Hours: ${task.hours ?? ''}</span>
            </div>
            <div class="task-actions">
                <button onclick="updateTaskStatus('${task.id}', 'completed')" class="btn-primary">Mark Complete</button>
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

function updateTaskStatus(taskId, status) {
    const tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
    const taskIndex = tasks.findIndex(t => t.id === taskId);

    if (taskIndex !== -1) {
        tasks[taskIndex].status = status;
        localStorage.setItem('tasks', JSON.stringify(tasks));

        // Reload dashboard
        loadUserDashboard();

        alert('Task status updated!');
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

    // Add sample tasks
    const tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
    if (tasks.length === 0) {
        tasks.push({
            id: 'task1',
            title: 'Prepare materials',
            description: 'Gather cleaning supplies',
            assignedTo: 'john@example.com',
            priority: 'High',
            status: 'pending',
            dueDate: '2024-05-10'
        });
        localStorage.setItem('tasks', JSON.stringify(tasks));
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