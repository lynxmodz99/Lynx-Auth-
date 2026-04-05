
/*
const firebaseConfig = {
    apiKey: "AIzaSyAdxgaXA0cJBESZnA679Ej2i0zo3e-40BA",
    authDomain: "lynx-auth-d17dd.firebaseapp.com",
    projectId: "lynx-auth-d17dd",
    storageBucket: "lynx-auth-d17dd.firebasestorage.app",
    messagingSenderId: "839612819820",
    appId: "1:839612819820:web:7576f107b7af280d776b49",
    measurementId: "G-RLZC3MPQL0"
};
*/


if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();


const API_URL = "https://lynxauth.onrender.com";


let currentOwnerId = null;
let currentUserEmail = null;
let cachedApps = [];
let currentLang = 'cs';
let currentAppUsers = [];


auth.onAuthStateChanged(async (user) => {
    if (user) {
        document.getElementById("auth-view").style.display = "none";
        document.getElementById("dashboard-view").style.display = "grid";

        currentUserEmail = user.email;
        document.getElementById("sidebar-email").innerText = user.email.length > 20 ? user.email.substring(0, 18) + '...' : user.email;

        await syncSeller(user);
        updateCodeView();
    } else {
        document.getElementById("auth-view").style.display = "flex";
        document.getElementById("dashboard-view").style.display = "none";
    }
});

async function emailLogin() {
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-password").value;

    if (!email || !pass) return showPopup("Error", "Please fill in all fields.");

    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
        showPopup("Login Failed", e.message);
    }
}

async function emailRegister() {
    const email = document.getElementById("reg-email").value;
    const pass = document.getElementById("reg-password").value;

    if (!email || !pass) return showPopup("Error", "Please fill in all fields.");

    try {
        await auth.createUserWithEmailAndPassword(email, pass);
        showPopup("Success", "Account created! You are now logged in.");
    } catch (e) {
        showPopup("Registration Failed", e.message);
    }
}

async function googleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
    } catch (e) {
        showPopup("Google Login Failed", e.message);
    }
}

function logout() {
    auth.signOut();
    window.location.reload();
}

function deleteAccount() {
    if (confirm("Are you sure you want to delete your account? This will delete all apps and users.")) {
        apiCall("/seller/delete", { ownerid: currentOwnerId })
            .then(() => {
                const user = auth.currentUser;
                user.delete().then(() => window.location.reload());
            });
    }
}


function showRegisterForm() {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "block";
}

function showLoginForm() {
    document.getElementById("register-form").style.display = "none";
    document.getElementById("login-form").style.display = "block";
}

function showView(viewName) {
    document.querySelectorAll(".content-view").forEach(el => el.classList.remove("active"));
    document.getElementById(viewName + "-content").classList.add("active");

    document.querySelectorAll(".nav-btn-side").forEach(el => el.classList.remove("active"));
    const navMap = {
        'dashboard': 'nav-dash',
        'applications': 'nav-apps',
        'users': 'nav-users',
        'integration': 'nav-integration',
        'instructions': 'nav-instructions',
        'webhooks': 'nav-webhooks'
    };
    if (navMap[viewName]) document.getElementById(navMap[viewName]).classList.add("active");

    document.querySelector(".sidebar").classList.remove("open");
    document.getElementById("sidebar-overlay").style.display = "none";

    if (viewName === 'applications') loadApps();
    if (viewName === 'webhooks') populateWebhookDropdown();
    if (viewName === 'users') loadUsersViewDropdown();
}

function toggleMobileMenu() {
    const sb = document.querySelector(".sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sb.classList.contains("open")) {
        sb.classList.remove("open");
        overlay.style.display = "none";
    } else {
        sb.classList.add("open");
        overlay.style.display = "block";
    }
}

async function apiCall(endpoint, body) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (response.status !== 200) throw new Error(data.detail || "Unknown Error");
        return data;
    } catch (e) {
        showPopup("API Error", e.message);
        throw e;
    }
}

async function syncSeller(user) {
    try {
        const data = await apiCall("/auth/sync", {
            firebase_uid: user.uid,
            email: user.email
        });

        if (data.status === "success") {
            currentOwnerId = data.ownerid;
            document.getElementById("ownerid-display").innerText = currentOwnerId;
            document.getElementById("stat-coins").innerText = data.coins;
            document.getElementById("stat-sub").innerText = data.is_premium ? "Premium" : "Free Tier";
            document.getElementById("stat-sub").style.color = data.is_premium ? "var(--primary)" : "#888";

            document.getElementById("status-text").innerText = "Online";
            document.getElementById("status-badge").classList.remove("offline");

            loadApps(true);
        }
    } catch (e) {
        console.error("Sync error", e);
        document.getElementById("status-text").innerText = "Offline";
        document.getElementById("status-badge").classList.add("offline");
    }
}

async function createApp() {
    const name = document.getElementById("app-name-input").value;
    if (!name) return showPopup("Error", "App name is required");

    try {
        await apiCall("/apps/create", { ownerid: currentOwnerId, app_name: name });
        document.getElementById("new-app-panel").style.display = "none";
        document.getElementById("app-name-input").value = "";
        showPopup("Success", "Application created successfully!");
        loadApps();
        syncSeller(auth.currentUser);
    } catch (e) { }
}

async function loadApps(updateStats = false) {
    try {
        const data = await apiCall("/apps/list", { ownerid: currentOwnerId });
        cachedApps = data.apps;

        const listContainer = document.getElementById("apps-list");
        listContainer.innerHTML = "";

        if (updateStats) {
            document.getElementById("stat-total-apps").innerText = cachedApps.length;
        }

        cachedApps.forEach(app => {
            const div = document.createElement("div");
            div.className = "app-row";
            div.innerHTML = `
                <div class="app-row-header" onclick="this.parentElement.classList.toggle('expanded')">
                    <div class="app-title"><i class="fa-solid fa-cube"></i> ${app.name}</div>
                    <div style="display:flex; align-items:center;">
                        <span class="app-meta">ID: ${app.appid.substring(0, 8)}...</span>
                        <i class="fa-solid fa-chevron-down" style="color:#555"></i>
                    </div>
                </div>
                <div class="app-row-details">
                    <div class="secret-box">
                        <span>Secret: <span style="color:white;">${app.app_secret}</span></span>
                        <i class="fa-solid fa-copy copy-icon" onclick="copyToClipboard('${app.app_secret}')"></i>
                    </div>
                    <div style="display:flex; gap:10px; margin-bottom:20px; align-items:center; flex-wrap:wrap;">
                        <input id="u-name-${app.appid}" class="auth-input" style="margin:0; background:#111; flex:1; min-width:120px;" placeholder="Username">
                        <input id="u-pass-${app.appid}" class="auth-input" style="margin:0; background:#111; flex:1; min-width:120px;" placeholder="Password">
                        <input type="datetime-local" id="u-exp-${app.appid}" class="auth-input" style="margin:0; background:#111; color:#fff; flex:1; min-width:160px;">
                        <button class="btn-primary-sm" onclick="createUser('${app.appid}')">Create User</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; border-top:1px solid #222; padding-top:15px;">
                        <button class="btn-ghost-sm" onclick="openUsersModal('${app.appid}', '${app.name}')">Manage Users</button>
                        <button class="btn-danger-sm" onclick="deleteApp('${app.appid}')">Delete App</button>
                    </div>
                </div>
            `;
            listContainer.appendChild(div);
        });
    } catch (e) {
        console.error(e);
    }
}

async function deleteApp(appid) {
    if (!confirm("Are you sure? This deletes all users in this app.")) return;
    try {
        await apiCall("/apps/delete", { appid: appid });
        showPopup("Success", "App deleted.");
        loadApps(true);
    } catch (e) { }
}

async function createUser(appid) {
    const userEl = document.getElementById(`u-name-${appid}`);
    const passEl = document.getElementById(`u-pass-${appid}`);
    const expEl = document.getElementById(`u-exp-${appid}`);

    const username = userEl.value;
    const password = passEl.value;
    const expireStr = expEl.value;

    if (!username || !password) return showPopup("Error", "Username and Password required.");

    const payload = {
        ownerid: currentOwnerId,
        appid: appid,
        username: username,
        password: password,
        days: 0
    };

    if (expireStr) {
        payload.expire_str = expireStr;
    }

    try {
        await apiCall("/users/create", payload);
        showPopup("Success", `User ${username} created!`);
        userEl.value = "";
        passEl.value = "";
        expEl.value = "";
    } catch (e) { }
}



function loadUsersViewDropdown() {
    const listContainer = document.getElementById("dropdown-options-list");
    const hiddenInput = document.getElementById("user-app-filter");
    const triggerText = document.getElementById("dropdown-selected-text");


    listContainer.innerHTML = "";

    const currentVal = hiddenInput.value;
    const currentApp = cachedApps.find(a => a.appid === currentVal);

    if (currentApp) {
        triggerText.innerText = currentApp.name;
        triggerText.style.color = "#fff";
    } else {
        triggerText.innerText = "Select Application";
        triggerText.style.color = "#888";
    }


    cachedApps.forEach(app => {
        const div = document.createElement("div");
        div.className = "dropdown-option";
        div.innerHTML = `<span>${app.name}</span> <i class="fa-solid fa-check"></i>`;

        div.onclick = () => {
            selectAppOption(app.appid, app.name);
        };

        listContainer.appendChild(div);
    });
}


function toggleAppDropdown() {
    const container = document.getElementById("dropdown-options-list");
    const trigger = document.querySelector(".dropdown-trigger");


    container.classList.toggle("open");
    trigger.classList.toggle("active");
}

function selectAppOption(appid, appName) {

    const textEl = document.getElementById("dropdown-selected-text");
    textEl.innerText = appName;
    textEl.style.color = "#fff";


    document.getElementById("user-app-filter").value = appid;


    toggleAppDropdown();


    loadUsersForSelectedApp();
}


window.addEventListener('click', function (e) {
    const dropdown = document.getElementById('custom-app-dropdown');
    const container = document.getElementById("dropdown-options-list");
    const trigger = document.querySelector(".dropdown-trigger");

    if (dropdown && !dropdown.contains(e.target)) {
        if (container.classList.contains('open')) {
            container.classList.remove('open');
            trigger.classList.remove('active');
        }
    }
});

function openUsersModal(appid, appName) {
    showView('users');
    const sel = document.getElementById("user-app-filter");
    sel.value = appid;
    loadUsersForSelectedApp();
}

async function loadUsersForSelectedApp() {
    const appid = document.getElementById("user-app-filter").value;
    const container = document.getElementById("users-table-body");

    if (!appid) {
        container.innerHTML = '<div class="empty-state">Select an application to view users.</div>';
        return;
    }

    container.innerHTML = '<div class="empty-state">Loading users...</div>';

    try {
        const data = await apiCall("/users/list", { appid: appid });
        currentAppUsers = data.users;
        renderUsers(currentAppUsers);
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Failed to load users.</div>';
    }
}

function renderUsers(users) {
    const container = document.getElementById("users-table-body");
    const appid = document.getElementById("user-app-filter").value;

    if (users.length === 0) {
        container.innerHTML = '<div class="empty-state">No users found.</div>';
        return;
    }

    container.innerHTML = "";

    users.forEach(u => {
        let datePart = "Never";
        if (u.expires_at) datePart = u.expires_at.split('T')[0];

        const isLocked = u.hwid_locked !== false;
        const hwidDisplay = u.hwid ? "Linked" : "Not Linked";
        const hwidColor = u.hwid ? "#10b981" : "#666";

        const row = document.createElement("div");
        row.className = "user-list-item";
        row.innerHTML = `
            <div style="flex:1; font-weight:500; display:flex; gap:8px; align-items:center;">
                ${u.username}
                ${isLocked ? '<i class="fa-solid fa-lock" style="font-size:0.7rem; color:var(--primary);" title="Secure"></i>' : '<i class="fa-solid fa-lock-open" style="font-size:0.7rem; color:#666;" title="Unlocked"></i>'}
            </div>
            
            <div style="flex:1; font-size:0.8rem;">
                <span style="color:${hwidColor};">● ${hwidDisplay}</span>
            </div>
            
            <div style="flex:1; font-size:0.85rem; color:#888;">${datePart}</div>
            
            <div style="width:120px; text-align:right;">
                <div class="action-btn-wrapper action-container">
                    
                    <!-- 1. Three Dots (Opens Central Modal) -->
                    <button class="btn-icon" onclick="openSettingsModal('${u.id}', '${u.username}', '${u.expires_at || ''}', ${isLocked})">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>

                    <!-- 2. Separate Delete Button -->
                    <button class="btn-danger-sm" style="padding:6px 10px;" onclick="deleteUser('${u.id}', '${appid}', '')">
                        <i class="fa-solid fa-trash"></i>
                    </button>

                </div>
            </div>
        `;
        container.appendChild(row);
    });
}


function toggleMenu(uid, event) {
    event.stopPropagation();
    document.querySelectorAll('.action-menu').forEach(el => {
        if (el.id !== `menu-${uid}`) el.classList.remove('show');
    });
    const menu = document.getElementById(`menu-${uid}`);
    menu.classList.toggle('show');
}

document.addEventListener('click', function (e) {
    if (!e.target.closest('.action-menu') && !e.target.closest('.btn-icon')) {
        document.querySelectorAll('.action-menu').forEach(el => el.classList.remove('show'));
    }
});

async function toggleHwidLock(uid, newState) {
    try {
        await apiCall("/users/action", {
            user_id: uid,
            action: "toggle_lock",
            lock_state: newState
        });

        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to toggle lock.");
        loadUsersForSelectedApp();
    }
}

async function resetHWID(uid) {
    if (!confirm("Reset HWID for this user?")) return;
    try {
        await apiCall("/users/action", { user_id: uid, action: "reset_hwid" });
        showPopup("Success", "HWID Reset.");
        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed.");
    }
}

function openTimeModal(uid) {
    document.getElementById("time-user-id").value = uid;
    document.getElementById("time-modal").style.display = "flex";
    document.getElementById(`menu-${uid}`).classList.remove('show');
}

function closeTimeModal(e) {
    if (e.target.id === "time-modal") document.getElementById("time-modal").style.display = "none";
}

async function submitTimeUpdate() {
    const uid = document.getElementById("time-user-id").value;
    const days = parseInt(document.getElementById("time-input").value);

    if (isNaN(days)) return showPopup("Error", "Invalid days.");

    try {
        await apiCall("/users/action", { user_id: uid, action: "add_time", value: days });
        document.getElementById("time-modal").style.display = "none";
        showPopup("Success", "Time updated.");
        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to update time.");
    }
}

function filterUsers() {
    const query = document.getElementById("user-search").value.toLowerCase();
    const filtered = currentAppUsers.filter(u => u.username.toLowerCase().includes(query));
    renderUsers(filtered);
}

function closeModal() {
    document.getElementById("manage-users-modal").style.display = "none";
}

async function deleteUser(userId, appid, appName) {
    if (!confirm("Delete this user?")) return;
    try {
        await apiCall("/users/delete", { user_id: userId });

        loadUsersForSelectedApp();
    } catch (e) { }
}


function populateWebhookDropdown() {
    const sel = document.getElementById("wh-app-select");
    sel.innerHTML = '<option value="" disabled selected>Select an App...</option>';
    cachedApps.forEach(app => {
        const opt = document.createElement("option");
        opt.value = app.appid;
        opt.innerText = app.name;
        sel.appendChild(opt);
    });
}

function loadWebhookSettings() {
    const appid = document.getElementById("wh-app-select").value;
    const app = cachedApps.find(a => a.appid === appid);
    if (!app) return;

    const conf = app.webhook_config || {};
    document.getElementById("wh-url").value = conf.url || "";
    document.getElementById("wh-enabled").checked = !!conf.enabled;
    document.getElementById("wh-show-app").checked = !!conf.show_app;
    document.getElementById("wh-show-hwid").checked = !!conf.show_hwid;
    document.getElementById("wh-show-exp").checked = !!conf.show_expiry;
}

async function saveWebhook() {
    const appid = document.getElementById("wh-app-select").value;
    if (!appid) return showPopup("Error", "Select an app first.");

    const config = {
        appid: appid,
        webhook_url: document.getElementById("wh-url").value,
        enabled: document.getElementById("wh-enabled").checked,
        show_app: document.getElementById("wh-show-app").checked,
        show_hwid: document.getElementById("wh-show-hwid").checked,
        show_expiry: document.getElementById("wh-show-exp").checked
    };

    try {
        await apiCall("/apps/webhook/save", config);
        showPopup("Success", "Webhook settings saved.");
        const app = cachedApps.find(a => a.appid === appid);
        if (app) app.webhook_config = config;
    } catch (e) { }
}


const CODE_CS = `using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace LynxAuth
{
    /// <summary>
    /// LynxAuth authentication handler
    /// </summary>
    public class Auth
    {
        private readonly string OwnerId;
        private readonly string Secret;
        private readonly string ApiUrl;
        private static readonly HttpClient client = new HttpClient();

        public Auth(string ownerid, string secret, string apiUrl = "https://lynxauth.onrender.com")
        {
            OwnerId = ownerid;
            Secret = secret;

            if (apiUrl.EndsWith("/"))
                apiUrl = apiUrl.TrimEnd('/');

            ApiUrl = $"\${apiUrl}/api/1.0/user_login";
        }

        private static string GetHwid()
        {
            var input = $"\${Environment.MachineName}-\${Environment.UserName}-\${Environment.ProcessorCount}";
            using (var sha256 = SHA256.Create())
            {
                var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(input));
                return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
            }
        }

        public async Task<dynamic> Login(string username, string password)
        {
            var payload = new
            {
                ownerid = OwnerId,
                app_secret = Secret,
                username = username,
                password = password,
                hwid = GetHwid()
            };

            var json = JsonConvert.SerializeObject(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            try
            {
                var response = await client.PostAsync(ApiUrl, content);
                var result = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject(result);
            }
            catch (HttpRequestException e)
            {
                return new { success = false, message = $"Connection Error: \${e.Message}" };
            }
        }
    }
}`;

const CODE_PY = `import requests
import platform
import hashlib

class LynxAuthAPI:
    def __init__(self, ownerid, secret, api_url="https://lynxauth.onrender.com"):
        if api_url.endswith("/"):
            api_url = api_url[:-1]
        
        self.ownerid = ownerid
        self.secret = secret
        self.api_url = f"https://lynxauth.onrender.com/api/1.0/user_login"

    def get_hwid(self):
        return hashlib.sha256(f"{platform.node()}-{platform.processor()}".encode()).hexdigest()

    def login(self, username, password):
        payload = {
            "ownerid": self.ownerid,
            "app_secret": self.secret,
            "username": username,
            "password": password,
            "hwid": self.get_hwid()
        }
        try:
            response = requests.post(self.api_url, json=payload)
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"success": False, "message": f"Connection Error: {e}"}
`;

function switchTab(lang) {
    currentLang = lang;
    document.querySelectorAll(".t-tab").forEach(el => el.classList.remove("active"));
    document.getElementById(`tab-${lang}`).classList.add("active");
    updateCodeView();
}

function updateCodeView() {
    let code = currentLang === 'cs' ? CODE_CS : CODE_PY;
    if (currentOwnerId) {
        code = code.replace("REPLACE_WITH_OWNERID", currentOwnerId)
            .replace("YOUR_OWNER_ID", currentOwnerId);
    }
    document.getElementById("code-view").innerText = code;
}

function downloadCurrentCode() {
    const ext = currentLang === 'cs' ? 'cs' : 'py';
    const text = document.getElementById("code-view").innerText;
    const blob = new Blob([text], { type: "text/plain" });
    const anchor = document.createElement("a");
    anchor.download = `auth.${ext}`;
    anchor.href = window.URL.createObjectURL(blob);
    anchor.target = "_blank";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}

function downloadProject(type) {
    const filePath = type === 'cs' ? 'Examples/csharp_example.rar' : 'Examples/python_example.rar';
    const link = document.createElement("a");
    link.href = filePath;
    link.download = filePath.split('/').pop();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showPopup("Download Started", "Your project files are downloading...");
}

function copyToClipboard(text) {
    if (text === 'ownerid-display') text = document.getElementById('ownerid-display').innerText;

    navigator.clipboard.writeText(text).then(() => {
        showPopup("Copied", "Copied to clipboard!");
    });
}

function showPopup(title, msg) {
    const overlay = document.getElementById("popup-overlay");
    document.getElementById("popup-title").innerText = title;
    document.getElementById("popup-message").innerText = msg;

    const iconDiv = document.getElementById("popup-icon");
    if (title.toLowerCase().includes("error") || title.toLowerCase().includes("failed")) {
        iconDiv.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:var(--danger)"></i>';
    } else {
        iconDiv.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--success)"></i>';
    }

    overlay.style.display = "flex";
}

function closePopup() {
    document.getElementById("popup-overlay").style.display = "none";
}

function closePopupBackground(event) {
    if (event.target.id === "popup-overlay") {
        closePopup();
    }
}


function toggleMenu(uid, event) {
    event.stopPropagation();

    document.querySelectorAll('.action-menu').forEach(el => {
        if (el.id !== `menu-${uid}`) el.classList.remove('show');
    });

    const menu = document.getElementById(`menu-${uid}`);
    menu.classList.toggle('show');
}

document.addEventListener('click', function (e) {
    if (!e.target.closest('.action-btn-wrapper')) {
        document.querySelectorAll('.action-menu').forEach(el => el.classList.remove('show'));
    }
});

async function toggleHwidLock(uid, newState) {
    try {
        await apiCall("/users/action", {
            user_id: uid,
            action: "toggle_lock",
            lock_state: newState
        });
        showPopup("Success", newState ? "HWID Locked." : "HWID Unlocked.");
        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to toggle lock.");
    }
}


async function resetHWID(uid) {
    if (!confirm("Are you sure you want to reset the HWID for this user?")) return;
    try {
        await apiCall("/users/action", { user_id: uid, action: "reset_hwid" });
        showPopup("Success", "HWID has been reset.");
        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to reset HWID.");
    }
}


function openTimeModal(uid) {
    document.getElementById("time-user-id").value = uid;
    document.getElementById("time-modal").style.display = "flex";
    document.getElementById(`menu-${uid}`).classList.remove('show');
}

function closeTimeModal(e) {
    if (e.target.id === "time-modal") {
        document.getElementById("time-modal").style.display = "none";
    }
}

async function submitTimeUpdate() {
    const uid = document.getElementById("time-user-id").value;
    const days = parseInt(document.getElementById("time-input").value);

    if (isNaN(days)) return showPopup("Error", "Invalid days.");

    try {
        await apiCall("/users/action", {
            user_id: uid,
            action: "add_time",
            value: days
        });
        document.getElementById("time-modal").style.display = "none";
        showPopup("Success", "Subscription updated.");
        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to update time.");
    }
}


function openSettingsModal(uid, username, expiresAt, isLocked) {
    document.getElementById("usm-uid").value = uid;
    document.getElementById("usm-title").innerText = "Settings: " + username;


    document.getElementById("usm-lock-toggle").checked = isLocked;


    if (expiresAt) {

        let fmtDate = expiresAt;
        if (expiresAt.length > 16) fmtDate = expiresAt.substring(0, 16);
        document.getElementById("usm-date").value = fmtDate;
    } else {
        document.getElementById("usm-date").value = "";
    }

    document.getElementById("user-settings-modal").style.display = "flex";
}

function closeSettingsModal(e) {
    if (e.target.id === "user-settings-modal") {
        document.getElementById("user-settings-modal").style.display = "none";
    }
}


async function updateLockStateFromModal() {
    const uid = document.getElementById("usm-uid").value;
    const isLocked = document.getElementById("usm-lock-toggle").checked;

    try {
        await apiCall("/users/action", {
            user_id: uid,
            action: "toggle_lock",
            lock_state: isLocked
        });

        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to update lock state.");
    }
}


async function resetHwidFromModal() {
    const uid = document.getElementById("usm-uid").value;
    if (!confirm("Are you sure you want to reset HWID?")) return;

    try {
        await apiCall("/users/action", { user_id: uid, action: "reset_hwid" });
        showPopup("Success", "HWID has been reset.");
        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to reset HWID.");
    }
}


async function saveExpiryFromModal() {
    const uid = document.getElementById("usm-uid").value;
    const dateStr = document.getElementById("usm-date").value;

    if (!dateStr) return showPopup("Error", "Please select a date.");

    try {
        await apiCall("/users/action", {
            user_id: uid,
            action: "set_expiry",
            expire_str: dateStr
        });
        showPopup("Success", "Expiration date updated.");
        loadUsersForSelectedApp();
        document.getElementById("user-settings-modal").style.display = "none";
    } catch (e) {
        showPopup("Error", "Failed to update date.");
    }
}