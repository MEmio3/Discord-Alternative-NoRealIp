/* ═══════════════════════════════════════════════════════
   UNIFIED HUB — APP.JS
   Eel Bridge — Python does the logic, JS does the rendering.
═══════════════════════════════════════════════════════ */

'use strict';

class App {
  constructor() {
    this.config = {};
    this.currentRoomIsHost = false;
    this._contextTarget = null;
    this.joinTimeout = null;
    this.hoverShowTimer = null;
    this.hoverHideTimer = null;
    this.originalNicks = {}; // Stores the unchangeable HashID for every user
    
    this._injectDynamicHTML();
    this._initElements();
    this._bindEvents();

    eel.py_get_config()((conf) => {
      this.config = conf;
      this._boot();
    });
  }

  playTone(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        const now = ctx.currentTime;
        
        if (type === 'mute' || type === 'deafen') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'unmute' || type === 'undeafen') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'join') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(660, now + 0.1);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'leave') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(660, now);
            osc.frequency.setValueAtTime(440, now + 0.1);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    } catch(e) { }
  }

  _generateChannelUID() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      let result = '';
      for (let i = 0; i < 20; i++) result += chars[Math.floor(Math.random() * chars.length)];
      return result;
  }

  // --- DYNAMICALLY INJECTS MISSING HTML TO PREVENT CRASHES ---
  _injectDynamicHTML() {
    // 1. Host IP Field
    const hostPortInput = document.getElementById('hostPort');
    if (hostPortInput && !document.getElementById('hostIP')) {
        const hostGroup = hostPortInput.parentElement;
        const ipGroup = document.createElement('div');
        ipGroup.className = 'form-group';
        ipGroup.innerHTML = '<label class="form-label">HOST IP / BIND ADDRESS</label><input type="text" id="hostIP" class="form-input" placeholder="0.0.0.0 or VPN IP" value="0.0.0.0" />';
        hostGroup.parentNode.insertBefore(ipGroup, hostGroup);
    }

    // 2. Loading Overlay
    if (!document.getElementById('loadingOverlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'modal-overlay hidden';
        overlay.style.zIndex = '9999';
        overlay.innerHTML = `<div class="modal-box" style="text-align: center; width: 300px; padding: 40px 20px;"><h2 style="color:var(--green); font-family:var(--font-display); letter-spacing: 0.1em; margin-bottom: 10px;">CONNECTING...</h2><p style="color:var(--text-muted); font-size: 0.8rem;">Waiting for connection</p></div>`;
        document.body.appendChild(overlay);
    }

    // 3. Discord-Style Audio Menus (Mic & Speaker separate)
    if (!document.getElementById('micMenu')) {
        const micMenu = document.createElement('div');
        micMenu.id = 'micMenu';
        micMenu.className = 'context-menu hidden';
        micMenu.style.cssText = 'width: 260px; z-index: 9999;';
        micMenu.innerHTML = `<div style="padding: 6px 12px; font-size: 0.55rem; color: var(--text-muted); letter-spacing:0.1em; font-family:var(--font-display); font-weight:bold;">INPUT DEVICE (MICROPHONE)</div><div id="micMenuInputs" style="max-height:150px; overflow-y:auto;"></div>`;
        document.body.appendChild(micMenu);
    }
    if (!document.getElementById('speakerMenu')) {
        const spkMenu = document.createElement('div');
        spkMenu.id = 'speakerMenu';
        spkMenu.className = 'context-menu hidden';
        spkMenu.style.cssText = 'width: 260px; z-index: 9999;';
        spkMenu.innerHTML = `<div style="padding: 6px 12px; font-size: 0.55rem; color: var(--text-muted); letter-spacing:0.1em; font-family:var(--font-display); font-weight:bold;">OUTPUT DEVICE (SPEAKER)</div><div id="speakerMenuOutputs" style="max-height:150px; overflow-y:auto;"></div>`;
        document.body.appendChild(spkMenu);
    }

    // 4. In-Room Settings Modal (For mid-call PFP/Bio changes)
    if (!document.getElementById('inRoomSettingsModal')) {
        const setMod = document.createElement('div');
        setMod.id = 'inRoomSettingsModal';
        setMod.className = 'modal-overlay hidden';
        setMod.innerHTML = `
        <div class="modal-box" style="width: 380px;">
            <div class="modal-tag">ROOM SETTINGS</div>
            <button class="modal-close" id="settingsCloseBtn">✕</button>
            <div class="profile-edit-avatar-wrap" style="justify-content: center; margin-bottom: 20px; border:none; padding-bottom:0;">
                <div class="avatar-upload-zone small" id="settingsAvatarZone" title="Click to change avatar">
                    <div class="avatar-ring" style="width: 80px; height: 80px;">
                        <img id="settingsAvatarPreview" src="" alt="" class="avatar-img hidden" />
                        <div class="avatar-placeholder" id="settingsAvatarPlaceholder">
                            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                        </div>
                    </div>
                    <span class="avatar-label">CHANGE PFP</span>
                </div>
            </div>
            <div class="form-group"><label class="form-label">CALLSIGN</label><input type="text" id="settingsNick" class="form-input" maxlength="24" /></div>
            <div class="form-group"><label class="form-label">BIO SIGNATURE</label><textarea id="settingsBio" class="form-input form-textarea" maxlength="120"></textarea></div>
            <button class="btn btn-primary btn-full" id="settingsSaveBtn" style="margin-top: 15px;"><span class="btn-icon">✔</span> APPLY & SYNC</button>
        </div>`;
        document.body.appendChild(setMod);

        const gearBtn = document.createElement('button');
        gearBtn.className = 'media-btn';
        gearBtn.id = 'roomSettingsBtn';
        gearBtn.title = 'Room Settings';
        gearBtn.innerHTML = '⚙️';
        gearBtn.style.fontSize = '1.1rem';
        const rightBar = document.querySelector('.room-topbar-right');
        if(rightBar) rightBar.prepend(gearBtn);
    }
    
    // 5. Add Caret arrows to Mic and Deafen buttons
    const addCaret = (btnId) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.style.position = 'relative';
        const caret = document.createElement('div');
        caret.innerHTML = '▼';
        caret.style.cssText = 'position:absolute; bottom:2px; right:4px; font-size:10px; color:var(--text-muted); cursor:pointer; padding:2px; z-index: 10;';
        caret.id = btnId + 'Caret';
        btn.appendChild(caret);
    };
    addCaret('micBtn');
    addCaret('deafenBtn');

    // 6. Inject Fullscreen Button
    const closeStreamBtn = document.getElementById('closeStreamBtn');
    if (closeStreamBtn && !document.getElementById('fullscreenStreamBtn')) {
        const fsBtn = document.createElement('button');
        fsBtn.id = 'fullscreenStreamBtn';
        fsBtn.className = 'btn btn-outline';
        fsBtn.style.cssText = 'padding:4px 10px; font-size:0.5rem; letter-spacing:0.1em; margin-right: 10px; border-color: var(--green); color: var(--green); display: flex; align-items: center; justify-content: center;';
        fsBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" style="width:12px; height:12px; margin-right:6px;"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>FULLSCREEN`;
        closeStreamBtn.parentNode.insertBefore(fsBtn, closeStreamBtn);
    }
  }

  _initElements() {
    this.screenSetup = document.getElementById('screen-setup');
    this.screenHome  = document.getElementById('screen-home');
    this.screenRoom  = document.getElementById('screen-room');

    this.setupNick   = document.getElementById('setupNick');
    this.setupBio    = document.getElementById('setupBio');
    this.avatarZone  = document.getElementById('avatarZone');
    this.avatarPreview = document.getElementById('avatarPreview');
    this.avatarPlaceholder = document.getElementById('avatarPlaceholder');
    this.setupSaveBtn = document.getElementById('setupSaveBtn');

    this.topbarUser   = document.getElementById('topbarUser');
    this.topbarNick   = document.getElementById('topbarNick');
    this.topbarAvatar = document.getElementById('topbarAvatar');
    this.navTabs = document.querySelectorAll('.nav-tab');
    this.panels  = document.querySelectorAll('.panel');

    this.hostRoomName = document.getElementById('hostRoomName');
    this.hostPort     = document.getElementById('hostPort');
    this.hostPassword = document.getElementById('hostPassword');
    this.hostBtn      = document.getElementById('hostBtn');
    this.hostIP       = document.getElementById('hostIP');
    this.joinIP       = document.getElementById('joinIP');
    this.joinPort     = document.getElementById('joinPort');
    this.joinPassword = document.getElementById('joinPassword');
    this.joinBtn      = document.getElementById('joinBtn');
    
    this.hostedList   = document.getElementById('hostedList');
    this.savedList    = document.getElementById('savedList');

    this.profileNick          = document.getElementById('profileNick');
    this.profileBio           = document.getElementById('profileBio');
    this.profileSaveBtn       = document.getElementById('profileSaveBtn');
    this.displayUID           = document.getElementById('displayUID');
    this.profileAvatarZone    = document.getElementById('profileAvatarZone');
    this.profileAvatarPreview = document.getElementById('profileAvatarPreview');
    this.profileAvatarPlaceholder = document.getElementById('profileAvatarPlaceholder');

    this.roomNameDisplay  = document.getElementById('roomNameDisplay');
    this.roomCodeDisplay  = document.getElementById('roomCodeDisplay');
    this.connectionStatus = document.getElementById('connectionStatus');
    this.connectionLabel  = document.getElementById('connectionLabel');
    this.leaveRoomBtn     = document.getElementById('leaveRoomBtn');
    this.participantCount = document.getElementById('participantCount');
    this.userList         = document.getElementById('userList');
    this.chatMessages     = document.getElementById('chatMessages');
    this.chatInput        = document.getElementById('chatInput');
    this.sendBtn          = document.getElementById('sendBtn');
    this.attachBtn        = document.getElementById('attachBtn');
    this.uploadStatus     = document.getElementById('uploadStatus');

    this.micBtn    = document.getElementById('micBtn');
    this.deafenBtn = document.getElementById('deafenBtn');
    this.liveBtn   = document.getElementById('liveBtn');
    
    this.videoSection = document.getElementById('videoSection');
    this.videoCanvas = document.getElementById('videoCanvas');
    this.watchingLabel = document.getElementById('watchingLabel');
    this.closeStreamBtn = document.getElementById('closeStreamBtn');
    this.fullscreenStreamBtn = document.getElementById('fullscreenStreamBtn');

    // Modals
    this.profileModal      = document.getElementById('profileModal');
    this.profileModalClose = document.getElementById('profileModalClose');
    this.modalAvatar       = document.getElementById('modalAvatar');
    this.modalNick         = document.getElementById('modalNick');
    this.modalUID          = document.getElementById('modalUID');
    this.modalBio          = document.getElementById('modalBio');

    this.streamModal = document.getElementById('streamModal');
    this.streamModalClose = document.getElementById('streamModalClose');
    this.streamSource = document.getElementById('streamSource');
    this.streamRes = document.getElementById('streamRes');
    this.streamFps = document.getElementById('streamFps');
    this.streamStartConfirmBtn = document.getElementById('streamStartConfirmBtn');

    this.hostDisconnectModal = document.getElementById('hostDisconnectModal');
    this.hostDisconnectClose = document.getElementById('hostDisconnectClose');
    this.btnRealShutdown = document.getElementById('btnRealShutdown');
    this.btnMigrateHost = document.getElementById('btnMigrateHost');
    this.btnBgLobby = document.getElementById('btnBgLobby');

    this.secHostPromptModal = document.getElementById('secHostPromptModal');
    this.btnAcceptSecHost = document.getElementById('btnAcceptSecHost');
    this.btnDeclineSecHost = document.getElementById('btnDeclineSecHost');

    this.inRoomSettingsModal = document.getElementById('inRoomSettingsModal');
    this.settingsCloseBtn = document.getElementById('settingsCloseBtn');
    this.settingsAvatarZone = document.getElementById('settingsAvatarZone');
    this.settingsAvatarPreview = document.getElementById('settingsAvatarPreview');
    this.settingsAvatarPlaceholder = document.getElementById('settingsAvatarPlaceholder');
    this.settingsNick = document.getElementById('settingsNick');
    this.settingsBio = document.getElementById('settingsBio');
    this.settingsSaveBtn = document.getElementById('settingsSaveBtn');
    this.roomSettingsBtn = document.getElementById('roomSettingsBtn');

    this.micMenu = document.getElementById('micMenu');
    this.speakerMenu = document.getElementById('speakerMenu');
    this.loadingOverlay = document.getElementById('loadingOverlay');

    this.contextMenu        = document.getElementById('contextMenu');
    this.ctxViewProfile     = document.getElementById('ctx-view-profile');
    this.ctxMakeSecondary   = document.getElementById('ctx-make-secondary');
    this.ctxBan             = document.getElementById('ctx-ban');

    this.homeToast = document.getElementById('homeToast');
    this.roomToast = document.getElementById('roomToast');
    
    this.serverBanner = document.getElementById('serverBanner');
    this.reenterBtn = document.getElementById('reenterBtn');
    this.shutdownBtn = document.getElementById('shutdownBtn');
  }

  // --- AUDIO CONTEXT MENUS (DISCORD STYLE) ---
  async _showAudioMenu(type, e, anchorBtn) {
    e.preventDefault();
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        let targetMenu, targetContainer, targetKind;
        if (type === 'mic') {
            targetMenu = this.micMenu;
            targetContainer = document.getElementById('micMenuInputs');
            targetKind = 'audioinput';
            this.speakerMenu.classList.add('hidden');
        } else {
            targetMenu = this.speakerMenu;
            targetContainer = document.getElementById('speakerMenuOutputs');
            targetKind = 'audiooutput';
            this.micMenu.classList.add('hidden');
        }
        
        targetContainer.innerHTML = '';
        let found = false;
        
        devices.forEach(d => {
            if (d.kind !== targetKind) return;
            found = true;
            const item = document.createElement('div');
            item.className = 'context-item';
            item.style.fontSize = '0.75rem';
            item.style.padding = '8px 12px';
            item.textContent = d.label || `Device ${d.deviceId.slice(0,5)}...`;
            
            item.onclick = () => {
                this.showToast('room', `SELECTED: ${item.textContent}`);
                targetMenu.classList.add('hidden');
                // Automatically unmute/undeafen!
                if (type === 'mic' && this.micBtn.classList.contains('muted')) this.micBtn.click();
                if (type === 'speaker' && this.deafenBtn.classList.contains('deafened')) this.deafenBtn.click();
            };
            targetContainer.appendChild(item);
        });
        
        if(!found) targetContainer.innerHTML = '<div class="context-item" style="color:var(--text-muted);">No Devices Found</div>';
        
        targetMenu.classList.remove('hidden');
        
        const rect = anchorBtn.getBoundingClientRect();
        let topPos = rect.top - targetMenu.offsetHeight - 10;
        if(topPos < 0) topPos = rect.bottom + 10; 
        
        let leftPos = rect.left;
        if(leftPos + 260 > window.innerWidth) leftPos = window.innerWidth - 270;
        
        targetMenu.style.left = leftPos + 'px';
        targetMenu.style.top  = topPos + 'px';
        
    } catch(err) {
        this.showToast('room', 'MIC PERMISSION DENIED', true);
    }
  }

  _bindEvents() {
    // Media Dropdowns
    document.getElementById('micBtnCaret').addEventListener('click', (e) => this._showAudioMenu('mic', e, this.micBtn));
    this.micBtn.addEventListener('contextmenu', (e) => this._showAudioMenu('mic', e, this.micBtn));
    document.getElementById('deafenBtnCaret').addEventListener('click', (e) => this._showAudioMenu('speaker', e, this.deafenBtn));
    this.deafenBtn.addEventListener('contextmenu', (e) => this._showAudioMenu('speaker', e, this.deafenBtn));

    // Fullscreen Listeners
    if (this.fullscreenStreamBtn) {
        this.fullscreenStreamBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                if (this.videoSection.requestFullscreen) {
                    this.videoSection.requestFullscreen().catch(err => console.warn("Fullscreen error:", err));
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        });
    }

    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement === this.videoSection) {
            if (this.fullscreenStreamBtn) {
                this.fullscreenStreamBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" style="width:12px; height:12px; margin-right:6px;"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>EXIT FULLSCREEN`;
                this.fullscreenStreamBtn.style.borderColor = 'var(--red)';
                this.fullscreenStreamBtn.style.color = 'var(--red)';
            }
            this.videoSection.style.maxHeight = '100%';
            this.videoSection.style.height = '100%';
        } else {
            if (this.fullscreenStreamBtn) {
                this.fullscreenStreamBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" style="width:12px; height:12px; margin-right:6px;"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>FULLSCREEN`;
                this.fullscreenStreamBtn.style.borderColor = 'var(--green)';
                this.fullscreenStreamBtn.style.color = 'var(--green)';
            }
            this.videoSection.style.maxHeight = '50%';
            this.videoSection.style.height = 'auto';
        }
    });

    if (this.videoCanvas) {
        this.videoCanvas.addEventListener('dblclick', () => {
            if (this.fullscreenStreamBtn) this.fullscreenStreamBtn.click();
        });
        this.videoCanvas.style.cursor = 'pointer';
        this.videoCanvas.title = 'Double-click to toggle Fullscreen';
    }

    // In-Room Settings
    if (this.roomSettingsBtn) {
        this.roomSettingsBtn.addEventListener('click', () => {
            this.settingsNick.value = this.config.nickname || '';
            this.settingsBio.value = this.config.bio || '';
            if(this.config.dp_dataurl) {
                this.settingsAvatarPreview.src = this.config.dp_dataurl;
                this.settingsAvatarPreview.classList.remove('hidden');
                this.settingsAvatarPlaceholder.classList.add('hidden');
            } else {
                this.settingsAvatarPreview.classList.add('hidden');
                this.settingsAvatarPlaceholder.classList.remove('hidden');
            }
            this.inRoomSettingsModal.classList.remove('hidden');
        });
    }

    if (this.settingsCloseBtn) {
        this.settingsCloseBtn.addEventListener('click', () => this.inRoomSettingsModal.classList.add('hidden'));
    }

    if (this.inRoomSettingsModal) {
        this.inRoomSettingsModal.addEventListener('mousedown', (e) => {
            if (e.target === this.inRoomSettingsModal) this.inRoomSettingsModal.classList.add('hidden');
        });
    }

    if (this.settingsAvatarZone) {
        this.settingsAvatarZone.addEventListener('click', () => {
            eel.py_change_avatar()((b64) => {
                if (b64) {
                    this.config.dp_dataurl = b64;
                    this.settingsAvatarPreview.src = b64;
                    this.settingsAvatarPreview.classList.remove('hidden');
                    this.settingsAvatarPlaceholder.classList.add('hidden');
                }
            });
        });
    }

    if (this.settingsSaveBtn) {
        this.settingsSaveBtn.addEventListener('click', () => {
            const nick = this.settingsNick.value.trim();
            if(nick) this.config.nickname = nick;
            this.config.bio = this.settingsBio.value.trim();
            eel.py_save_config(this.config)();
            this._populateTopbar();
            this.showToast('room', 'SETTINGS APPLIED');
            this.inRoomSettingsModal.classList.add('hidden');
        });
    }

    this.avatarZone.addEventListener('click', () => {
      eel.py_change_avatar()((b64) => {
        if (b64) {
          this.config.dp_dataurl = b64;
          this.avatarPreview.src = b64;
          this.avatarPreview.classList.remove('hidden');
          this.avatarPlaceholder.classList.add('hidden');
        }
      });
    });

    this.profileAvatarZone.addEventListener('click', () => {
      eel.py_change_avatar()((b64) => {
        if (b64) {
          this.config.dp_dataurl = b64;
          this.profileAvatarPreview.src = b64;
          this.profileAvatarPreview.classList.remove('hidden');
          this.profileAvatarPlaceholder.classList.add('hidden');
          eel.py_save_config(this.config)();
          this._populateTopbar();
          this.showToast('home', 'AVATAR UPDATED');
        }
      });
    });

    this.setupSaveBtn.addEventListener('click', () => {
      const nick = this.setupNick.value.trim();
      const bio  = this.setupBio.value.trim();
      if (!nick) return;
      this.config.nickname = nick;
      this.config.bio = bio;
      this.config.setup_done = true;
      eel.py_save_config(this.config)();
      this._boot();
    });

    this.profileSaveBtn.addEventListener('click', () => {
      const nick = this.profileNick.value.trim();
      if (!nick) return;
      this.config.nickname = nick;
      this.config.bio = this.profileBio.value.trim();
      eel.py_save_config(this.config)();
      this._populateTopbar();
      this.showToast('home', 'IDENTITY UPDATED');
    });
    
    this.topbarUser.addEventListener('click', () => {
        const profileTab = document.querySelector('.nav-tab[data-panel="panel-profile"]');
        if (profileTab) profileTab.click();
    });

    this.navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.navTabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.panel).classList.add('active');
        if (tab.dataset.panel === 'panel-profile') {
          this.profileNick.value = this.config.nickname;
          this.profileBio.value = this.config.bio || "";
          this.displayUID.textContent = this.config.uid;
          if (this.config.dp_dataurl) {
            this.profileAvatarPreview.src = this.config.dp_dataurl;
            this.profileAvatarPreview.classList.remove('hidden');
            this.profileAvatarPlaceholder.classList.add('hidden');
          }
        }
      });
    });

    this.hostBtn.addEventListener('click', () => {
      const name = this.hostRoomName.value.trim() || 'Unnamed Room';
      const port = this.hostPort.value || "25565";
      const pwd = this.hostPassword.value.trim();
      this.currentRoomIsHost = true;
      
      let prevCode = this.hostBtn.dataset.rehostCode || null;
      let channelUid = this.hostBtn.dataset.channelUid || null;
      
      if (!channelUid) {
          const existing = (this.config.saved_channels || []).find(c => c.mode === 'host' && c.name === name && String(c.port) === String(port));
          if (existing) {
              prevCode = existing.code;
              channelUid = existing.channelUid || existing.code;
          } else {
              channelUid = this._generateChannelUID();
          }
      }

      this.chatMessages.innerHTML = '';
      this.userList.innerHTML = '';
      this.originalNicks = {};

      navigator.mediaDevices.getUserMedia({ audio: true }).catch(()=>{}); 

      const msgEl = this.onSystemMessage(`Hosting on port ${port}<span id="hostAnimDots">.</span>`, true);
      let dots = 1;
      const anim = setInterval(() => {
          const el = document.getElementById('hostAnimDots');
          if(!el) { clearInterval(anim); return; }
          dots = (dots % 3) + 1;
          el.textContent = '.'.repeat(dots);
      }, 400);

      eel.py_start_host(name, port, pwd, prevCode, channelUid)((roomCode) => {
          clearInterval(anim);
          if (msgEl) {
              msgEl.innerHTML = `✅ HOSTED USING PORT ${port}`;
              msgEl.style.color = "var(--green)";
              msgEl.style.fontWeight = "bold";
          }
          this._enterRoom(name, roomCode, true);
          this.hostBtn.dataset.rehostCode = ''; 
          this.hostBtn.dataset.channelUid = ''; 
          this._saveCurrentChannel(name, port, pwd, roomCode, 'host', channelUid); 
      });
    });

    this.joinBtn.addEventListener('click', () => {
      const ip = this.joinIP.value.trim();
      const port = this.joinPort.value || "25565";
      const pwd = this.joinPassword.value.trim();
      if (!ip) return;
      this.currentRoomIsHost = false;
      
      this.chatMessages.innerHTML = '';
      this.userList.innerHTML = '';
      this.originalNicks = {};
      
      this.loadingOverlay.classList.remove('hidden');
      
      this.joinTimeout = setTimeout(() => {
          this.loadingOverlay.classList.add('hidden');
          this.showToast('home', 'CONNECTION TIMED OUT', true);
      }, 5000);

      navigator.mediaDevices.getUserMedia({ audio: true }).catch(()=>{});
      eel.py_start_client(ip, port, pwd)();
    });

    this.sendBtn.addEventListener('click', () => this._sendMessage());
    this.chatInput.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter') this._sendMessage(); 
    });

    this.attachBtn.addEventListener('click', () => {
        eel.py_attach_file()();
    });

    // ── HOST DISCONNECT FLOW ──
    this.leaveRoomBtn.addEventListener('click', () => {
      if (this.currentRoomIsHost) {
          this.hostDisconnectModal.classList.remove('hidden');
      } else {
          eel.py_disconnect(true)();
          this._showScreen('home');
          this.videoSection.classList.add('hidden');
          this._renderSavedChannels();
      }
    });

    this.hostDisconnectClose.addEventListener('click', () => this.hostDisconnectModal.classList.add('hidden'));
    
    this.btnRealShutdown.addEventListener('click', () => {
        eel.py_disconnect(true)();
        this._showScreen('home');
        this.serverBanner.classList.add('hidden');
        this.hostDisconnectModal.classList.add('hidden');
        this.videoSection.classList.add('hidden');
        this._renderSavedChannels(); 
    });

    this.btnBgLobby.addEventListener('click', () => {
        eel.py_disconnect(false)();
        this._showScreen('home');
        this.serverBanner.classList.remove('hidden');
        this.hostDisconnectModal.classList.add('hidden');
        this.videoSection.classList.add('hidden');
        this._renderSavedChannels();
    });

    this.btnMigrateHost.addEventListener('click', () => {
        eel.py_migrate_server()((success) => {
            if (success) {
                this._showScreen('home');
                this.hostDisconnectModal.classList.add('hidden');
                this.videoSection.classList.add('hidden');
                this._renderSavedChannels();
            } else {
                this.onSystemMessage("⚠️ Cannot migrate because no Secondary Host is assigned.");
                this.hostDisconnectModal.classList.add('hidden');
            }
        });
    });

    // ── SECONDARY HOST PROMPT ──
    this.btnAcceptSecHost.addEventListener('click', () => {
        this.secHostPromptModal.classList.add('hidden');
        this.onSystemMessage("Testing port capability...");
        setTimeout(() => {
            eel.py_accept_secondary()();
        }, 1500);
    });

    this.btnDeclineSecHost.addEventListener('click', () => {
        this.secHostPromptModal.classList.add('hidden');
    });

    this.reenterBtn.addEventListener('click', () => {
        this.chatMessages.innerHTML = '';
        this.userList.innerHTML = '';
        
        eel.py_reenter_vc()((roomInfo) => {
            if(roomInfo) {
                this.roomNameDisplay.textContent = roomInfo.name;
                this.roomCodeDisplay.textContent = roomInfo.code;
                this.connectionStatus.classList.add('connected');
                this.connectionLabel.textContent = 'HOST — ACTIVE';
                document.querySelectorAll('.host-only').forEach(el => el.classList.remove('hidden'));
                
                this._showScreen('room');
                this.serverBanner.classList.add('hidden');
            }
        });
    });
    
    this.shutdownBtn.addEventListener('click', () => {
        eel.py_disconnect(true)();
        this.serverBanner.classList.add('hidden');
        this.showToast('home', 'SERVER SHUTDOWN SUCCESS');
        this._renderSavedChannels();
    });

    this.micBtn.addEventListener('click', (e) => {
      if (e.target.id === 'micBtnCaret') return; 
      eel.py_toggle_mic()((isMuted) => {
        this.micBtn.classList.toggle('muted', isMuted);
        this.micBtn.querySelector('.icon-mic').classList.toggle('hidden', isMuted);
        this.micBtn.querySelector('.icon-mic-off').classList.toggle('hidden', !isMuted);
        this.showToast('room', isMuted ? 'MIC MUTED' : 'MIC LIVE');
        this.playTone(isMuted ? 'mute' : 'unmute');
      });
    });

    this.deafenBtn.addEventListener('click', (e) => {
      if (e.target.id === 'deafenBtnCaret') return;
      eel.py_toggle_deafen()((isDeaf) => {
        this.deafenBtn.classList.toggle('deafened', isDeaf);
        this.deafenBtn.querySelector('.icon-deaf').classList.toggle('hidden', isDeaf);
        this.deafenBtn.querySelector('.icon-deaf-off').classList.toggle('hidden', !isDeaf);
        if (isDeaf) {
            this.micBtn.classList.add('muted');
            this.micBtn.querySelector('.icon-mic').classList.add('hidden');
            this.micBtn.querySelector('.icon-mic-off').classList.remove('hidden');
        }
        this.showToast('room', isDeaf ? 'DEAFENED' : 'UNDEAFENED');
        this.playTone(isDeaf ? 'deafen' : 'undeafen');
      });
    });

    // ── STREAMING MODAL ──
    this.liveBtn.addEventListener('click', () => {
      if (this.liveBtn.classList.contains('live')) {
          eel.py_toggle_stream("720p", "30", "monitor:1")((started) => {
              this.liveBtn.classList.remove('live');
              this.showToast('room', 'SCREEN SHARE ENDED');
          });
      } else {
          eel.py_get_video_sources()((sources) => {
              this.streamSource.innerHTML = '';
              sources.forEach(s => {
                  const opt = document.createElement('option');
                  opt.value = s.id;
                  opt.textContent = s.name;
                  this.streamSource.appendChild(opt);
              });
              if(this.streamModal) this.streamModal.classList.remove('hidden');
          });
      }
    });

    if (this.streamStartConfirmBtn) {
        this.streamStartConfirmBtn.addEventListener('click', () => {
            const res = this.streamRes.value;
            const fps = this.streamFps.value;
            const src = this.streamSource.value;

            eel.py_toggle_stream(res, fps, src)((started) => {
                if (started) {
                    this.liveBtn.classList.add('live');
                    this.showToast('room', 'SCREEN SHARE ACTIVE');
                    this.streamModal.classList.add('hidden');
                    
                    eel.py_watch_stream(this.config.uid)();
                    this.watchingLabel.textContent = `WATCHING YOUR STREAM`;
                    this.videoSection.classList.remove('hidden');
                }
            });
        });
    }

    if (this.closeStreamBtn) {
        this.closeStreamBtn.addEventListener('click', () => {
            eel.py_stop_watching()();
            this.videoSection.classList.add('hidden');
        });
    }

    if (this.streamModalClose) {
        this.streamModalClose.addEventListener('click', () => {
            this.streamModal.classList.add('hidden');
        });
    }

    if (this.profileModalClose) {
        this.profileModalClose.addEventListener('click', () => {
            this._closeProfileModal();
        });
    }

    // Handle global clicks to close context menus and profile modal
    document.addEventListener('click', (e) => {
        // Close Audio/Right-click menus
        if (!e.target.closest('.context-menu') && e.target.id !== 'micBtnCaret' && e.target.id !== 'deafenBtnCaret') {
            if (this.contextMenu) this.contextMenu.classList.add('hidden');
            if (this.micMenu) this.micMenu.classList.add('hidden');
            if (this.speakerMenu) this.speakerMenu.classList.add('hidden');
        }

        // Close Profile Modal if clicked outside of it
        if (this.profileModal && !this.profileModal.classList.contains('hidden')) {
            // Ignore clicks if they were on the modal itself, the avatar (which opens it), or the view profile context menu
            if (!e.target.closest('.modal-box') && !e.target.closest('.user-item') && !e.target.closest('.msg-avatar') && e.target.id !== 'ctx-view-profile') {
                this._closeProfileModal();
            }
        }
    });
    
    if (this.ctxViewProfile) {
        this.ctxViewProfile.addEventListener('click', () => {
            const u = Array.from(document.querySelectorAll('.user-item')).find(el => el.dataset.uid === this._contextTarget);
            if (u) {
                const rect = u.getBoundingClientRect();
                this._openProfileModal(this._contextTarget, rect.right + 15, Math.max(10, rect.top - 20));
            }
        });
    }
    
    if (this.ctxMakeSecondary) {
        this.ctxMakeSecondary.addEventListener('click', () => {
            eel.py_request_secondary(this._contextTarget)();
            this.contextMenu.classList.add('hidden');
        });
    }
  }

  _boot() {
    if (!this.config.setup_done) {
      this._showScreen('setup');
    } else {
      this._showScreen('home');
      this._populateTopbar();
      this._renderSavedChannels();
    }
  }

  _showScreen(name) {
    ['setup', 'home', 'room'].forEach(n => document.getElementById(`screen-${n}`).classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
    if (name === 'home') {
        this._renderSavedChannels(); 
    }
  }

  _populateTopbar() {
    this.topbarNick.textContent = this.config.nickname || 'User';
    if (this.config.dp_dataurl) {
      this.topbarAvatar.innerHTML = `<img src="${this.config.dp_dataurl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      this.topbarAvatar.textContent = (this.config.nickname || 'U')[0].toUpperCase();
    }
  }

  _renderSavedChannels() {
    const channels = this.config.saved_channels || [];
    const hosted = channels.filter(c => c.mode === 'host');
    const joined = channels.filter(c => c.mode === 'join');

    const renderList = (list, container) => {
        if (!list.length) {
            container.innerHTML = '<p class="empty-hint">No channels found</p>';
            return;
        }
        container.innerHTML = list.map((ch) => `
          <div class="recent-item">
            <div class="recent-item-info">
              <div class="recent-item-name">${this._escHtml(ch.name || 'Unknown Room')}</div>
              <div class="recent-item-meta">${ch.ip}:${ch.port} • Code: ${ch.code}</div>
            </div>
            <button class="recent-item-btn" data-launch="${ch.code}">LAUNCH</button>
            <button class="recent-item-btn" style="color:var(--red); border-color:rgba(255,68,68,0.3); margin-left:5px;" data-remove="${ch.code}">✕</button>
          </div>
        `).join('');
        
        container.querySelectorAll('[data-launch]').forEach(btn => {
            btn.addEventListener('click', () => {
                const ch = channels.find(c => c.code === btn.dataset.launch);
                if (ch) {
                    if (ch.mode === 'host') {
                        this.hostRoomName.value = ch.name;
                        this.hostPort.value = ch.port;
                        this.hostPassword.value = ch.password || '';
                        if (this.hostIP) this.hostIP.value = ch.ip || '0.0.0.0';
                        this.hostBtn.dataset.rehostCode = ch.code;
                        this.hostBtn.dataset.channelUid = ch.channelUid || ch.code;
                        this.hostBtn.click();
                    } else {
                        this.joinIP.value = ch.ip;
                        this.joinPort.value = ch.port;
                        this.joinPassword.value = ch.password || '';
                        this.joinBtn.click();
                    }
                }
            });
        });

        container.querySelectorAll('[data-remove]').forEach(btn => {
            btn.addEventListener('click', () => {
                const code = btn.dataset.remove;
                this.config.saved_channels = this.config.saved_channels.filter(c => c.code !== code);
                eel.py_save_config(this.config)();
                this._renderSavedChannels();
            });
        });
    };
    
    renderList(hosted, this.hostedList);
    renderList(joined, this.savedList);
  }

  _saveCurrentChannel(name, port, password, code, mode, existingUid = null) {
      let channelUid = existingUid;
      if (mode === 'host' && !channelUid) {
          channelUid = this._generateChannelUID();
      }
      
      const entry = {
          name: name,
          ip: mode === 'host' ? (this.hostIP && this.hostIP.value ? this.hostIP.value : '0.0.0.0') : (this.joinIP.value || '127.0.0.1'),
          port: port,
          code: code,
          channelUid: channelUid,
          mode: mode,
          password: password,
          savedAt: Date.now()
      };
      if (!this.config.saved_channels) this.config.saved_channels = [];
      
      const existingIdx = this.config.saved_channels.findIndex(c => (mode === 'host' && c.channelUid === channelUid) || (mode === 'join' && c.code === code));
      
      if (existingIdx >= 0) {
          this.config.saved_channels[existingIdx] = entry;
      } else {
          this.config.saved_channels.push(entry);
      }
      eel.py_save_config(this.config)();
      this._renderSavedChannels();
  }

  _enterRoom(name, code, isHost) {
    this.roomNameDisplay.textContent = name;
    this.roomCodeDisplay.textContent = code;
    
    this.connectionStatus.classList.add('connected');
    this.connectionLabel.textContent = isHost ? 'HOST — ACTIVE' : 'CONNECTED';
    
    document.querySelectorAll('.host-only').forEach(el => {
        if(isHost) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });

    this._showScreen('room');
  }

  _sendMessage() {
    const text = this.chatInput.value.trim();
    if (!text) return;
    this.chatInput.value = '';
    eel.py_send_chat(text)();
  }

  onChatReceived(uid, nick, msg, dp, b64_img) {
    if (uid === "SYSTEM") {
        this.onSystemMessage(msg);
        return;
    }
    
    if (nick === "Someone" || !nick) {
        if (uid === this.config.uid) {
            nick = this.config.nickname;
            dp = this.config.dp_dataurl;
        } else {
            const item = this.userList.querySelector(`[data-uid="${uid}"]`);
            if (item) {
                const nickEl = item.querySelector('.user-nick');
                if (nickEl) nick = nickEl.textContent.replace(' ✦', '');
                const imgEl = item.querySelector('.user-avatar img');
                if (imgEl) dp = imgEl.src;
            }
        }
    }
    
    const isMine = uid === this.config.uid;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const group = document.createElement('div');
    group.className = `msg-group${isMine ? ' own' : ''}`;

    const avatarEl = document.createElement('div');
    avatarEl.className = 'msg-avatar';
    avatarEl.style.cursor = 'pointer';
    
    if (dp && dp.length > 100) {
        const src = dp.startsWith('data:') ? dp : 'data:image/jpeg;base64,' + dp;
        avatarEl.innerHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
        avatarEl.textContent = nick[0].toUpperCase();
    }
    
    // CLICK logic for Chat Message Profile Pictures
    avatarEl.addEventListener('click', (e) => {
        const rect = avatarEl.getBoundingClientRect();
        this._openProfileModal(uid, rect.right + 15, rect.top);
    });

    const content = document.createElement('div');
    content.className = 'msg-content';
    content.innerHTML = `<div class="msg-header"><span class="msg-nick">${this._escHtml(nick)}</span><span class="msg-time">${time}</span></div>`;

    let bodyEl = document.createElement('div');
    
    if (msg.startsWith('[IMAGE_PREVIEW]|')) {
        const src = b64_img || msg.split('|')[1];
        bodyEl.className = 'msg-bubble';
        bodyEl.innerHTML = `<strong>📷 Image Sent</strong><br><img src="${src}" class="msg-image" style="margin-top:6px; cursor:pointer;" />`;
        bodyEl.querySelector('img').addEventListener('click', () => eel.py_open_file(msg.split('|')[1])());
    } else if (msg.startsWith('[VIDEO_PREVIEW]|')) {
        const vidPath = msg.split('|')[1];
        bodyEl.className = 'msg-bubble';
        if (b64_img) {
            bodyEl.innerHTML = `<strong>🎬 Video Sent</strong><br><img src="${b64_img}" class="msg-image" style="margin-top:6px; cursor:pointer;" title="Click to play video" />`;
        } else {
            bodyEl.innerHTML = `<strong>🎬 Video Sent</strong><br><span style="color:var(--text-muted); font-size:0.7rem; cursor:pointer;">(Click to play video)</span>`;
        }
        bodyEl.style.cursor = 'pointer';
        bodyEl.addEventListener('click', () => eel.py_open_file(vidPath)());
    } else if (msg.includes('📎 Shared a file:')) {
        bodyEl.className = 'msg-bubble';
        bodyEl.innerHTML = msg;
        bodyEl.style.color = "var(--amber)";
    } else {
        bodyEl.className = 'msg-bubble';
        bodyEl.textContent = msg;
    }

    content.appendChild(bodyEl);
    group.appendChild(avatarEl);
    group.appendChild(content);
    this.chatMessages.appendChild(group);
    
    requestAnimationFrame(() => {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    });
  }

  onSystemMessage(msg, isHTML = false) {
    if (msg.startsWith("Connection rejected")) {
        clearTimeout(this.joinTimeout);
        this.loadingOverlay.classList.add('hidden');
        this.showToast('home', 'CONNECTION REJECTED', true);
        return null;
    }

    const el = document.createElement('div');
    el.className = 'msg-system';
    if (isHTML) el.innerHTML = msg;
    else el.textContent = msg;
    
    this.chatMessages.appendChild(el);
    requestAnimationFrame(() => { this.chatMessages.scrollTop = this.chatMessages.scrollHeight; });
    return el;
  }

  updateUserListUI(users) {
    this.userList.innerHTML = '';
    this.participantCount.textContent = users.length;
    
    if (!this.originalNicks) this.originalNicks = {};
    
    users.forEach(u => {
        // Log the permanent HashID on first sight
        if (!this.originalNicks[u.uid]) {
            this.originalNicks[u.uid] = u.nick;
        }

        const item = document.createElement('div');
        item.className = 'user-item';
        item.dataset.uid = u.uid;
        item.style.cursor = 'pointer';
        
        let avatarHTML = "";
        if (u.dp && u.dp.length > 100) {
            const src = u.dp.startsWith('data:') ? u.dp : 'data:image/jpeg;base64,' + u.dp;
            avatarHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
        } else {
            avatarHTML = u.nick[0].toUpperCase();
        }
        
        let badgeHTML = u.isLive ? `<span class="user-badge live-badge" style="background:var(--red); color:white; border:none; cursor:pointer;" title="Click to watch stream!">LIVE</span>` : '';
        if(u.isHost) badgeHTML += `<span class="user-badge">HOST</span>`;
        
        item.innerHTML = `
            <div class="user-avatar">${avatarHTML}</div>
            <span class="user-nick">${this._escHtml(u.nick)}</span>
            <div style="margin-left:auto; display:flex; gap:4px;">${badgeHTML}</div>
        `;
        
        // CLICK logic for Sidebar User List
        item.addEventListener('click', (e) => {
            const rect = item.getBoundingClientRect();
            this._openProfileModal(u.uid, rect.right + 15, Math.max(10, rect.top - 20));
        });

        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._contextTarget = u.uid;
            this.contextMenu.classList.remove('hidden');
            const vw = window.innerWidth; const vh = window.innerHeight;
            this.contextMenu.style.left = (e.clientX + 160 > vw ? e.clientX - 160 : e.clientX) + 'px';
            this.contextMenu.style.top  = (e.clientY + 100 > vh ? e.clientY - 100 : e.clientY) + 'px';
        });
        
        if (u.isLive) {
            const liveBadge = item.querySelector('.live-badge');
            if (liveBadge) {
                liveBadge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    eel.py_watch_stream(u.uid)();
                    this.watchingLabel.textContent = `WATCHING: ${u.nick.toUpperCase()}`;
                    this.videoSection.classList.remove('hidden');
                });
            }
        }
        this.userList.appendChild(item);
    });
  }

  setUserSpeaking(uid, speaking) {
    const item = this.userList.querySelector(`[data-uid="${uid}"]`);
    if (item) {
        item.classList.add('speaking');
        clearTimeout(item._speakTimer);
        item._speakTimer = setTimeout(() => item.classList.remove('speaking'), 500);
    }
  }

  setUploadStatus(isUploading, filename) {
      if(isUploading) {
          this.uploadStatus.style.display = 'inline';
          this.uploadStatus.style.color = 'var(--amber)';
          this.uploadStatus.textContent = `⏳ Uploading...`;
      } else {
          this.uploadStatus.style.color = 'var(--green)';
          this.uploadStatus.textContent = `✅ Sent!`;
          setTimeout(() => { this.uploadStatus.style.display = 'none'; }, 2000);
      }
  }

  _resetProfileInactivityTimer() {
      clearTimeout(this.profileInactivityTimer);
      this.profileInactivityTimer = setTimeout(() => {
          this._closeProfileModal();
      }, 10000); // 10 seconds of inactivity triggers auto-close
  }

  _openProfileModal(uid, x = null, y = null) {
    if (!uid) return;
    
    let peer = null;
    if (uid === this.config.uid) {
        peer = { uid: this.config.uid, nick: this.config.nickname, bio: this.config.bio, dp: this.config.dp_dataurl };
    } else {
        const item = this.userList.querySelector(`[data-uid="${uid}"]`);
        if (item) {
            const nickEl = item.querySelector('.user-nick');
            const nick = nickEl ? nickEl.textContent.replace(' ✦', '') : '';
            const imgEl = item.querySelector('.user-avatar img');
            peer = { uid: uid, nick: nick, bio: "User is in the voice channel.", dp: imgEl ? imgEl.src : '' };
        } else if (this.originalNicks && this.originalNicks[uid]) {
            peer = { uid: uid, nick: this.originalNicks[uid], bio: "User is in the voice channel.", dp: '' };
        }
    }
    
    if (!peer) return;

    this.modalNick.textContent = peer.nick || 'Unknown';
    
    // HashID Setup: Always displays their permanent original nickname next to the profile!
    const originalNick = (this.originalNicks && this.originalNicks[peer.uid]) ? this.originalNicks[peer.uid] : peer.nick;
    const hashId = `#${originalNick}`;
    this.modalUID.textContent  = `HashID: ${hashId}`;
    this.modalBio.textContent  = peer.bio || '—';

    if (peer.dp && peer.dp.length > 100) {
      const src = peer.dp.startsWith('data:') ? peer.dp : 'data:image/jpeg;base64,' + peer.dp;
      this.modalAvatar.innerHTML = `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      this.modalAvatar.textContent = (peer.nick || '?')[0].toUpperCase();
    }

    // Mid-Call Avatar Change Logic (Only on your own card)
    this.modalAvatar.style.cursor = peer.uid === this.config.uid ? 'pointer' : 'default';
    this.modalAvatar.onclick = () => {
        this._resetProfileInactivityTimer();
        if (peer.uid === this.config.uid) {
            eel.py_change_avatar()((b64) => {
                if (b64) {
                    this.config.dp_dataurl = b64;
                    this.modalAvatar.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
                    eel.py_save_config(this.config)();
                    this._populateTopbar();
                    this.showToast('room', 'AVATAR INSTANTLY UPDATED');
                }
            });
        }
    };
    
    const box = this.profileModal.querySelector('.modal-box');
    
    // Completely remove ALL CSS transitions for instant snap!
    box.style.transition = 'none';
    this.profileModal.style.transition = 'none';

    // Instant Click Mode with strict Bounds Checking
    if (x !== null && y !== null) {
         const boxWidth = 340; 
         const boxHeight = 280; 
         let finalX = x;
         let finalY = y;
         
         // Secure screen edge collision! Reverses box position to left if it hits the right boundary.
         if (finalX + boxWidth > window.innerWidth) {
             // Push left of avatar if it overflows right
             finalX = x - boxWidth - 60; 
         }
         if (finalY + boxHeight > window.innerHeight) {
             finalY = window.innerHeight - boxHeight - 20; 
         }
         if (finalX < 10) finalX = 10;
         if (finalY < 10) finalY = 10;
         
         this.profileModal.style.background = 'transparent';
         this.profileModal.style.backdropFilter = 'none';
         box.style.position = 'absolute';
         box.style.left = finalX + 'px';
         box.style.top = finalY + 'px';
         if (this.profileModalClose) this.profileModalClose.classList.add('hidden');
         
         // Reset inactivity timer when moving mouse inside the modal or clicking
         this.profileModal.onmousemove = () => { this._resetProfileInactivityTimer(); };
         this.profileModal.onclick = () => { this._resetProfileInactivityTimer(); };

    } else {
         // Classic Center Modal fallback
         this.profileModal.style.background = 'rgba(0,0,0,0.65)';
         this.profileModal.style.backdropFilter = 'blur(6px)';
         box.style.position = 'relative';
         box.style.left = 'auto';
         box.style.top = 'auto';
         if (this.profileModalClose) this.profileModalClose.classList.remove('hidden');
         this.profileModal.onmousemove = null;
         this.profileModal.onclick = null;
    }
    
    this.profileModal.classList.remove('hidden');
    this.profileModal.style.opacity = '1';
    box.style.opacity = '1';
    box.style.transform = 'scale(1)';

    // Start 10-second idle auto-close
    this._resetProfileInactivityTimer();
  }

  _closeProfileModal() {
      clearTimeout(this.profileInactivityTimer);
      if (!this.profileModal) return;
      const box = this.profileModal.querySelector('.modal-box');
      if (box.style.position === 'absolute') {
          // Absolute Instant Vanish. No fade out.
          this.profileModal.style.transition = 'none';
          box.style.transition = 'none';
          this.profileModal.style.opacity = '0';
          box.style.opacity = '0';
          this.profileModal.classList.add('hidden');
      } else {
          this.profileModal.classList.add('hidden');
      }
  }

  _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  showToast(context, msg, isError = false) {
    const el = context === 'room' ? this.roomToast : this.homeToast;
    el.textContent = msg;
    el.className = `toast show${isError ? ' error' : ''}`;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.classList.remove('show'); el.classList.add('hidden'); }, 2500);
  }
}

document.addEventListener('DOMContentLoaded', () => { window._app = new App(); });

eel.expose(js_on_chat_received);
function js_on_chat_received(uid, nick, msg, dp, b64_img) {
    if(window._app) window._app.onChatReceived(uid, nick, msg, dp, b64_img);
}

eel.expose(js_update_user_list);
function js_update_user_list(users) {
    if(window._app) window._app.updateUserListUI(users);
}

eel.expose(js_set_user_speaking);
function js_set_user_speaking(uid) {
    if(window._app) window._app.setUserSpeaking(uid, true);
}

eel.expose(js_render_video);
function js_render_video(b64) {
    if(window._app && window._app.videoCanvas) {
        window._app.videoCanvas.src = "data:image/jpeg;base64," + b64;
    }
}

eel.expose(js_upload_status);
function js_upload_status(isUploading, filename) {
    if(window._app) window._app.setUploadStatus(isUploading, filename);
}

eel.expose(js_on_room_accepted);
function js_on_room_accepted(code, name) {
    if(window._app) {
        clearTimeout(window._app.joinTimeout);
        window._app.loadingOverlay.classList.add('hidden');
        window._app.roomCodeDisplay.textContent = code;
        window._app.roomNameDisplay.textContent = name;
        window._app._enterRoom(name, code, false);
        
        if(!window._app.currentRoomIsHost) {
            window._app._saveCurrentChannel(name, window._app.joinPort.value, window._app.joinPassword.value, code, 'join');
        }
    }
}

eel.expose(js_rebuild_controls_as_host);
function js_rebuild_controls_as_host() {
    if(window._app) {
        window._app.currentRoomIsHost = true;
        document.querySelectorAll('.host-only').forEach(el => el.classList.remove('hidden'));
    }
}

eel.expose(js_show_secondary_prompt);
function js_show_secondary_prompt() {
    if(window._app) window._app.secHostPromptModal.classList.remove('hidden');
}