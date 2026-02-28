// --- 1. CONFIGURATION & STATE ---
const supabaseUrl = 'https://kkaelwhdcsgaodbhrxqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrYWVsd2hkY3NnYW9kYmhyeHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTA4NzksImV4cCI6MjA3MTc2Njg3OX0.wSFv1AZgZDXjGHiIwOHyWzqTDk0v6NbR4-2r90iF9ok';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let masterData = [];
let currentTab = 'dashboard';
const tabOrder = ['dashboard', 'applicants', 'branches', 'trash'];
let currentTabIndex = 0;
let isAnimating = false;
const branchOptions = ["Manila Main", "Quezon City", "Makati Hub", "Davao Branch", "Cebu Office"];

// --- 2. INITIALIZATION (Load Sidebar & Header) ---
async function loadComponents() {
    try {
        const [sidebarRes, headerRes] = await Promise.all([
            fetch('components/sidebar.html'),
            fetch('components/header.html')
        ]);

        document.getElementById('sidebar-container').innerHTML = await sidebarRes.text();
        document.getElementById('header-container').innerHTML = await headerRes.text();

        // I-link ang mga functions sa window object para gumana ang onclick sa AJAX HTML
        window.loadSection = loadSection;
        window.toggleSidebar = toggleSidebar;
        window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');
        window.openViewModal = openViewModal;
        window.rejectApplicant = rejectApplicant;
        window.restoreApplicant = restoreApplicant;
        window.toggleSelectAllTrash = toggleSelectAllTrash;
        window.bulkDeleteTrash = bulkDeleteTrash;
        window.handleLogout = handleLogout;

        applySavedSidebarState();
        
        // Load default tab
        await loadSection('dashboard');
        fetchData();
    } catch (error) {
        console.error("Initialization error:", error);
    }
}

// --- 3. THE AJAX ENGINE (Section Switching) ---
async function loadSection(sectionName) {
    if (isAnimating) return;
    const target = document.getElementById('main-content-area');
    if (!target) return;

    const newIndex = tabOrder.indexOf(sectionName);
    const directionClass = newIndex > currentTabIndex ? 'slide-up' : 'slide-down';
    
    isAnimating = true;
    target.classList.add(`${directionClass}-out`);

    setTimeout(async () => {
        try {
            const response = await fetch(`sections/${sectionName}.html`);
            if (!response.ok) throw new Error("Section not found");
            const html = await response.text();
            
            target.innerHTML = html;
            target.classList.remove(`${directionClass}-out`);
            target.classList.add(`${directionClass}-in`);

            currentTab = sectionName;
            currentTabIndex = newIndex;
            
            updateSidebarUI(sectionName);
            renderCurrentTab();

            setTimeout(() => {
                target.classList.remove(`${directionClass}-in`);
                isAnimating = false;
            }, 400);
        } catch (e) { 
            console.error(e); 
            isAnimating = false; 
            target.classList.remove(`${directionClass}-out`);
        }
    }, 400);
}

// --- 4. DATA FETCHING ---
async function fetchData() {
    const { data, error } = await _supabase.from('applicants').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);
    
    masterData = data;
    renderCurrentTab();
    updateGlobalUI(); 
}

function renderCurrentTab() {
    if (currentTab === 'dashboard') {
        renderDashboardStats();
        if (document.getElementById('branchChart')) renderCharts();
    } else if (currentTab === 'applicants') {
        renderTableRows();
    } else if (currentTab === 'trash') {
        renderTrashRows();
    }
}

// --- 5. TABLE & MODAL LOGIC ---

function renderTableRows() {
    const tbody = document.getElementById('applicant-table-body');
    if (!tbody) return;
    const activeData = masterData.filter(a => a.status?.toLowerCase() !== 'rejected');
    
    tbody.innerHTML = activeData.map(app => `
        <tr>
            <td style="padding-left: 20px;"><strong>${app.first_name} ${app.last_name}</strong></td>
            <td>${app.desired_position}</td>
            <td><span class="badge ${app.status.toLowerCase()}">${app.status}</span></td>
            <td>
                <button onclick="openViewModal('${app.id}')" class="btn-hire">View</button>
            </td>
        </tr>`).join('');
}

function renderTrashRows() {
    const tbody = document.getElementById('trash-table-body');
    const selectAll = document.getElementById('select-all-trash');
    const bulkBtn = document.getElementById('bulk-delete-btn');
    if (!tbody) return;

    const rejected = masterData.filter((a) => a.status?.toLowerCase() === 'rejected');
    if (selectAll) selectAll.checked = false;
    if (bulkBtn) bulkBtn.disabled = true;

    if (rejected.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:20px; text-align:center; color:#94a3b8;">Trash is empty.</td></tr>`;
        return;
    }

    tbody.innerHTML = rejected.map((app) => `
        <tr>
            <td style="padding: 12px 18px;"><input class="trash-check" type="checkbox" data-id="${app.id}" onchange="toggleSelectAllTrash()"></td>
            <td style="padding: 12px 18px; font-weight:700;">${app.first_name} ${app.last_name}</td>
            <td style="padding: 12px 18px;">${app.desired_position || 'N/A'}</td>
            <td style="padding: 12px 18px;"><span class="badge rejected">Rejected</span></td>
            <td style="padding: 12px 18px; text-align:center;">
                <button class="btn btn-sm btn-light" onclick="restoreApplicant('${app.id}')">Restore</button>
            </td>
        </tr>
    `).join('');
}

function toggleSelectAllTrash(source) {
    const allChecks = Array.from(document.querySelectorAll('.trash-check'));
    const bulkBtn = document.getElementById('bulk-delete-btn');
    const selectAll = document.getElementById('select-all-trash');

    if (source && source.checked !== undefined) {
        allChecks.forEach((cb) => { cb.checked = source.checked; });
    }

    const checkedCount = allChecks.filter((cb) => cb.checked).length;
    if (bulkBtn) bulkBtn.disabled = checkedCount === 0;
    if (selectAll && !source) {
        selectAll.checked = allChecks.length > 0 && checkedCount === allChecks.length;
    }
}

async function bulkDeleteTrash() {
    const ids = Array.from(document.querySelectorAll('.trash-check:checked')).map((cb) => cb.dataset.id);
    if (ids.length === 0) return;
    const proceed = confirm(`Delete ${ids.length} selected rejected records permanently?`);
    if (!proceed) return;

    const { error } = await _supabase.from('applicants').delete().in('id', ids);
    if (error) {
        alert(`Delete failed: ${error.message}`);
        return;
    }
    await fetchData();
}

async function openViewModal(id) {
    const app = masterData.find(a => a.id === id);
    if (!app) return;

    try {
        const container = document.getElementById('viewModal');
        const res = await fetch('components/profile-modal.html');
        container.innerHTML = await res.text();

        // Populate Data
        document.getElementById('v-full-name').innerText = `${app.first_name} ${app.last_name}`;
        document.getElementById('v-position').innerText = `Applying for: ${app.desired_position}`;
        document.getElementById('v-email').innerText = app.email;
        document.getElementById('v-dob').innerText = app.dob;
        document.getElementById('v-experience').innerText = app.security_experience || "None.";
        document.getElementById('v-id-img').src = app.valid_id_url || 'Resources/no-image.png';

        // Listeners
        document.getElementById('v-resume-btn').onclick = () => window.open(app.resume_url, '_blank');
        document.getElementById('v-reject-btn').onclick = () => { window.closeModal('viewModal'); rejectApplicant(app.id); };
        document.getElementById('v-approve-btn').onclick = () => {
            window.closeModal('viewModal');
            setTimeout(() => openAssignModal(app.id, `${app.first_name} ${app.last_name}`), 300);
        };

        container.classList.add('active');
    } catch (e) { console.error(e); }
}

// --- 6. BRANCH ASSIGNMENT (THE FIX) ---

window.openAssignModal = function(id, name) {
    const modal = document.getElementById('assignModal');
    const nameLabel = document.getElementById('assign-applicant-name');
    if (nameLabel) nameLabel.innerText = name;
    if (modal) modal.classList.add('active');
    
    // Attach event listener sa confirm button
    const confirmBtn = document.getElementById('confirmAssignBtn');
    if (confirmBtn) {
        confirmBtn.onclick = () => processAssignment(id);
    }
};

async function processAssignment(id) {
    const branch = document.getElementById('branch-select').value;
    const btn = document.getElementById('confirmAssignBtn');
    
    btn.disabled = true;
    btn.innerText = "Saving...";

    const { error } = await _supabase.from('applicants').update({ 
        status: 'Approved', 
        assigned_branch: branch,
        updated_at: new Date() 
    }).eq('id', id);

    if (!error) {
        window.closeModal('assignModal');
        await fetchData(); // Refresh data
        alert("Applicant Deployed Successfully!");
    } else {
        alert("Error: " + error.message);
    }
    btn.disabled = false;
    btn.innerText = "Confirm Deployment";
}

async function rejectApplicant(id) {
    const { error } = await _supabase.from('applicants').update({ status: 'Rejected' }).eq('id', id);
    if (!error) fetchData();
}

async function restoreApplicant(id) {
    const { error } = await _supabase.from('applicants').update({ status: 'Pending' }).eq('id', id);
    if (!error) fetchData();
}

// --- 7. UTILS ---

function renderDashboardStats() {
    const total = document.getElementById('stat-total');
    if (!total) return;
    total.innerText = masterData.length;
    document.getElementById('stat-pending').innerText = masterData.filter(a => a.status === 'Pending').length;
    document.getElementById('stat-approved').innerText = masterData.filter(a => a.status === 'Approved').length;
}

function updateSidebarUI(section) {
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
        if(el.getAttribute('onclick')?.includes(`'${section}'`)) el.classList.add('active');
    });
    const title = document.getElementById('current-title');
    if (title) title.innerText = section.toUpperCase();
}

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('rail');
        document.getElementById('header-container')?.classList.toggle('active');
        document.getElementById('main-content-area')?.classList.toggle('active');
        localStorage.setItem('sidebar_is_rail', sidebar.classList.contains('rail'));
    }
};

function applySavedSidebarState() {
    if (localStorage.getItem('sidebar_is_rail') === 'true') {
        document.getElementById('sidebar')?.classList.add('rail');
        document.getElementById('header-container')?.classList.add('active');
        document.getElementById('main-content-area')?.classList.add('active');
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    window.location.href = 'AdminLogin.html';
}

function updateGlobalUI() {
    const badge = document.getElementById('notif-badge');
    const pending = masterData.filter(a => a.status === 'Pending').length;
    if (badge) { badge.innerText = pending; badge.style.display = pending > 0 ? 'flex' : 'none'; }
}

// Start
loadComponents();
