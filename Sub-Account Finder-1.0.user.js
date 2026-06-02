// ==UserScript==
// @name         Sub-Account Finder + UI
// @namespace    Etooooo
// @version      2
// @author       Etooooo
// @description  SendGrid sub-account finder (manual panel) + "Check SendGrid" button on C-Series order pages that auto-logs in and runs an email search
// @match        https://app.sendgrid.com/*
// @match        https://*.webshopapp.com/admin/*
// @match        https://*.shoplightspeed.com/admin/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (/(?:^|\.)(?:webshopapp|shoplightspeed)\.com$/i.test(location.hostname)) {
        runCSeriesSide();
        return;
    }

    const SHARDS = { eu: 6, us: 4 };
    const SELECTORS = {
        loadMore: 'button[data-qahook="loadMoreUsersButton"]',
        subuserRow: '[data-subuser-username]',
        loginButton: 'button[data-qahook="loginButton"]',
    };
    const STORAGE_KEY = 'subAccountFinder.v2';
    const MAX_LOAD_ITERATIONS = 30;
    const LOAD_DELAY_MS = 2000;
    const PREFIX = 'saf';

    const css = `
        .${PREFIX}-root {
            position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
            font-size: 13px; color: #1f2937;
            transition: width 140ms ease, height 140ms ease, padding 140ms ease;
        }
        .${PREFIX}-root.is-min {
            width: 38px; height: 38px;
            background: #1a82e2; color: #fff;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(26,130,226,0.4);
            display: flex; align-items: center; justify-content: center;
            font-weight: 700; font-size: 11px;
            letter-spacing: 0.04em;
        }
        .${PREFIX}-root.is-min:hover { background: #1571c4; }
        .${PREFIX}-root.is-min > * { display: none !important; }
        .${PREFIX}-root.is-min::after { content: 'SG'; }
        .${PREFIX}-root:not(.is-min) {
            width: 220px;
            background: #fff;
            border: 1px solid #e5e7eb; border-radius: 10px;
            padding: 10px 12px 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        }
        .${PREFIX}-header {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 8px; padding-bottom: 6px;
            border-bottom: 1px solid #f0f0f0;
        }
        .${PREFIX}-title { font-weight: 600; font-size: 12px; color: #4b5563; }
        .${PREFIX}-close {
            width: 22px; height: 22px;
            background: transparent; border: none;
            color: #9ca3af; cursor: pointer;
            padding: 0; line-height: 1; font-size: 18px;
            border-radius: 4px;
            display: flex; align-items: center; justify-content: center;
        }
        .${PREFIX}-close:hover { background: #f3f4f6; color: #1f2937; }
        .${PREFIX}-row {
            display: flex; flex-direction: column; gap: 3px;
            margin-bottom: 8px;
        }
        .${PREFIX}-label {
            font-size: 10px; color: #6b7280;
            text-transform: uppercase; letter-spacing: 0.04em;
        }
        .${PREFIX}-input, .${PREFIX}-select {
            width: 100%; box-sizing: border-box;
            padding: 6px 8px;
            border-radius: 4px; border: 1px solid #d1d5db;
            background: #fff; font: inherit; font-size: 12px;
            color: #1f2937;
            -moz-appearance: textfield;
        }
        .${PREFIX}-input::-webkit-outer-spin-button,
        .${PREFIX}-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .${PREFIX}-select {
            padding-right: 24px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%236b7280' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 8px center;
            -moz-appearance: none; -webkit-appearance: none; appearance: none;
            cursor: pointer;
        }
        .${PREFIX}-input:focus, .${PREFIX}-select:focus {
            outline: none; border-color: #1a82e2;
            box-shadow: 0 0 0 2px rgba(26,130,226,0.15);
        }
        .${PREFIX}-result {
            padding: 6px 8px; margin: 4px 0 8px;
            background: #f3f4f6; border-radius: 4px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 11px; word-break: break-all;
            color: #1f2937;
        }
        .${PREFIX}-result.is-empty { color: #9ca3af; font-style: italic; }
        .${PREFIX}-btn {
            width: 100%; padding: 7px 10px;
            background: #1a82e2; color: #fff;
            border: none; border-radius: 4px;
            font-size: 12px; font-weight: 600;
            cursor: pointer; transition: background 120ms;
        }
        .${PREFIX}-btn:hover:not(:disabled) { background: #1571c4; }
        .${PREFIX}-btn:disabled { background: #9cbfe5; cursor: not-allowed; }
        .${PREFIX}-status {
            min-height: 1em; margin-top: 6px;
            font-size: 10px; color: #6b7280;
            word-break: break-word;
        }
        .${PREFIX}-status.is-info    { color: #6b7280; }
        .${PREFIX}-status.is-success { color: #16a34a; }
        .${PREFIX}-status.is-error   { color: #dc2626; }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const loadState = () => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        } catch {
            return {};
        }
    };
    const saveState = (state) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {}
    };

    const el = (tag, opts = {}) => {
        const node = document.createElement(tag);
        if (opts.class) node.className = opts.class;
        if (opts.text != null) node.textContent = opts.text;
        if (opts.html != null) node.innerHTML = opts.html;
        if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
        if (opts.on) for (const [k, v] of Object.entries(opts.on)) node.addEventListener(k, v);
        if (opts.children) for (const c of opts.children) node.appendChild(c);
        return node;
    };

    const buildPanel = () => {
        const title = el('span', { class: `${PREFIX}-title`, text: 'Sub-Account Finder' });
        const minBtn = el('button', {
            class: `${PREFIX}-close`,
            text: '×',
            attrs: { type: 'button', 'aria-label': 'Minimize', title: 'Minimize' },
        });
        const header = el('div', { class: `${PREFIX}-header`, children: [title, minBtn] });

        const shopId = el('input', {
            class: `${PREFIX}-input`,
            attrs: {
                id: `${PREFIX}-shop-id`,
                type: 'number',
                inputmode: 'numeric',
                placeholder: 'Enter Shop ID',
                autocomplete: 'off',
            },
        });
        const shopRow = el('div', {
            class: `${PREFIX}-row`,
            children: [
                el('label', { class: `${PREFIX}-label`, text: 'Shop ID', attrs: { for: `${PREFIX}-shop-id` } }),
                shopId,
            ],
        });

        const region = el('select', { class: `${PREFIX}-select`, attrs: { id: `${PREFIX}-region` } });
        for (const key of Object.keys(SHARDS)) {
            region.appendChild(el('option', { text: key.toUpperCase(), attrs: { value: key } }));
        }
        const regionRow = el('div', {
            class: `${PREFIX}-row`,
            children: [
                el('label', { class: `${PREFIX}-label`, text: 'Region', attrs: { for: `${PREFIX}-region` } }),
                region,
            ],
        });

        const result = el('div', { class: `${PREFIX}-result is-empty`, text: 'Sub-Account: —' });
        const login = el('button', {
            class: `${PREFIX}-btn`,
            text: 'Log In to Sub-Account',
            attrs: { type: 'button', disabled: 'disabled' },
        });
        const status = el('div', {
            class: `${PREFIX}-status is-info`,
            attrs: { role: 'status', 'aria-live': 'polite' },
        });

        const root = el('div', {
            class: `${PREFIX}-root`,
            attrs: { title: 'Sub-Account Finder — click to expand' },
            children: [header, shopRow, regionRow, result, login, status],
        });
        return { root, shopId, region, result, login, status, minBtn };
    };

    const ui = buildPanel();
    document.body.appendChild(ui.root);

    const parseShopId = () => {
        const raw = ui.shopId.value.trim();
        if (raw === '') return null;
        const n = Number(raw);
        return Number.isInteger(n) && n >= 0 ? n : null;
    };

    const computeSubAccount = (shopId, region) => {
        const mod = SHARDS[region];
        if (!mod) return null;
        return `ecom-prod-${region}-${shopId % mod}`;
    };

    const setStatus = (text, kind = 'info') => {
        ui.status.textContent = text;
        ui.status.className = `${PREFIX}-status is-${kind}`;
    };

    const updateDisplay = () => {
        const shopId = parseShopId();
        const region = ui.region.value;
        if (shopId === null) {
            ui.result.textContent = 'Sub-Account: —';
            ui.result.classList.add('is-empty');
            ui.login.disabled = true;
            setStatus('Enter a valid Shop ID', 'info');
            return;
        }
        const sub = computeSubAccount(shopId, region);
        ui.result.textContent = `Sub-Account: ${sub}`;
        ui.result.classList.remove('is-empty');
        ui.login.disabled = false;
        setStatus('', 'info');
        saveState({ shopId: ui.shopId.value, region });
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const loadAllUsers = async () => {
        for (let i = 0; i < MAX_LOAD_ITERATIONS; i++) {
            const btn = document.querySelector(SELECTORS.loadMore);
            if (!btn) return { done: true };
            if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return { done: true };
            btn.click();
            await sleep(LOAD_DELAY_MS);
        }
        return { done: false };
    };

    const loginToSlug = async (target) => {
        ui.login.disabled = true;
        try {
            setStatus('Loading sub-users…', 'info');
            const { done } = await loadAllUsers();
            if (!done) {
                setStatus(`Stopped after ${MAX_LOAD_ITERATIONS} load clicks. Try again.`, 'error');
                return false;
            }
            const row = [...document.querySelectorAll(SELECTORS.subuserRow)]
                .find((node) => node.getAttribute('data-subuser-username') === target);
            if (!row) {
                setStatus(`Sub-account ${target} not found`, 'error');
                return false;
            }
            const button = row.querySelector(SELECTORS.loginButton);
            if (!button) {
                setStatus(`Login button for ${target} not found`, 'error');
                return false;
            }
            setStatus(`Logging in to ${target}…`, 'success');
            button.click();
            return true;
        } finally {
            ui.login.disabled = parseShopId() === null;
        }
    };

    const loginToSubAccount = async () => {
        const shopId = parseShopId();
        if (shopId === null) {
            setStatus('Enter a valid Shop ID', 'error');
            return;
        }
        const region = ui.region.value;
        await loginToSlug(computeSubAccount(shopId, region));
    };

    const setMinimized = (minimized) => {
        ui.root.classList.toggle('is-min', minimized);
        ui.minBtn.setAttribute('aria-pressed', minimized ? 'true' : 'false');
        try {
            const cur = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, minimized }));
        } catch {}
    };

    ui.minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setMinimized(true);
    });
    ui.root.addEventListener('click', () => {
        if (ui.root.classList.contains('is-min')) setMinimized(false);
    });
    ui.shopId.addEventListener('input', updateDisplay);
    ui.region.addEventListener('change', updateDisplay);
    ui.login.addEventListener('click', loginToSubAccount);
    ui.shopId.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !ui.login.disabled) {
            e.preventDefault();
            loginToSubAccount();
        } else if (e.key === 'Escape') {
            ui.shopId.value = '';
            updateDisplay();
        }
    });

    const saved = loadState();
    if (saved.region && SHARDS[saved.region]) ui.region.value = saved.region;
    if (saved.shopId) ui.shopId.value = saved.shopId;
    setMinimized(saved.minimized === true);
    updateDisplay();

    const AUTO_SEARCH_KEY = 'sgrl.autoSearch';
    const AUTO_LOGIN_KEY = 'sgrl.autoLogin';
    const NAV_ATTEMPTS_KEY = 'sgrl.navAttempts';
    const AUTO_TTL_MS = 5 * 60 * 1000;
    const MAX_NAV_ATTEMPTS = 4;

    const stashAutoSearch = (email) => {
        try {
            sessionStorage.setItem(AUTO_SEARCH_KEY, JSON.stringify({ email, ts: Date.now() }));
        } catch {}
    };
    const readAutoSearch = () => {
        try {
            const raw = sessionStorage.getItem(AUTO_SEARCH_KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj?.email || !obj?.ts) return null;
            if (Date.now() - obj.ts > AUTO_TTL_MS) {
                sessionStorage.removeItem(AUTO_SEARCH_KEY);
                return null;
            }
            return obj.email;
        } catch { return null; }
    };
    const clearAutoSearch = () => {
        try { sessionStorage.removeItem(AUTO_SEARCH_KEY); } catch {}
    };

    const stashAutoLogin = (slug) => {
        try {
            sessionStorage.setItem(AUTO_LOGIN_KEY, JSON.stringify({ slug, ts: Date.now() }));
        } catch {}
    };
    const readAutoLogin = () => {
        try {
            const raw = sessionStorage.getItem(AUTO_LOGIN_KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj?.slug || !obj?.ts) return null;
            if (Date.now() - obj.ts > AUTO_TTL_MS) {
                sessionStorage.removeItem(AUTO_LOGIN_KEY);
                return null;
            }
            return obj.slug;
        } catch { return null; }
    };
    const clearAutoLogin = () => {
        try { sessionStorage.removeItem(AUTO_LOGIN_KEY); } catch {}
    };

    const getNavAttempts = () => parseInt(sessionStorage.getItem(NAV_ATTEMPTS_KEY) || '0', 10);
    const bumpNavAttempts = () => {
        const n = getNavAttempts() + 1;
        try { sessionStorage.setItem(NAV_ATTEMPTS_KEY, String(n)); } catch {}
        return n;
    };
    const resetNavAttempts = () => {
        try { sessionStorage.removeItem(NAV_ATTEMPTS_KEY); } catch {}
    };

    const findReturnToParentControl = () => {
        const candidates = [...document.querySelectorAll('a, button')];
        return candidates.find((node) => {
            const t = (node.textContent || '').trim();
            return /^(return\s+to\s+main(\s+account)?|return\s+to\s+parent|exit\s+sub-?user|exit\s+impersonation)/i.test(t);
        });
    };

    const stripParam = (name) => {
        const u = new URL(location.href);
        if (!u.searchParams.has(name)) return;
        u.searchParams.delete(name);
        history.replaceState({}, '', u.toString());
    };

    const reactSetInputValue = (input, value) => {
        const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (proto?.set) proto.set.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const waitForAny = (selectors, timeout = 10000) =>
        new Promise((resolve) => {
            const find = () => {
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) return el;
                }
                return null;
            };
            const found = find();
            if (found) return resolve(found);
            const mo = new MutationObserver(() => {
                const f = find();
                if (f) { mo.disconnect(); resolve(f); }
            });
            mo.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(() => { mo.disconnect(); resolve(null); }, timeout);
        });

    const describeInput = (el) => {
        if (!el) return null;
        return {
            tag: el.tagName,
            type: el.type,
            name: el.name || null,
            id: el.id || null,
            placeholder: el.placeholder || null,
            ariaLabel: el.getAttribute('aria-label'),
            class: el.className?.slice(0, 80),
        };
    };

    const typeIntoReactInput = async (input, value) => {
        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSet.call(input, '');
        input.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
        await sleep(30);
        for (let i = 0; i < value.length; i++) {
            const ch = value[i];
            const next = value.slice(0, i + 1);
            nativeSet.call(input, next);
            input.dispatchEvent(new InputEvent('input', {
                inputType: 'insertText', data: ch, bubbles: true, cancelable: false,
            }));
            await sleep(20);
        }
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const runAutoSearch = async (email) => {
        const candidateSelectors = [
            'input[name="recipient_email"]',
            'input[id="recipient_email"]',
            'input[placeholder*="recipient" i]',
            'input[name*="to_email" i]',
            'input[name*="recipient" i]',
            'input[placeholder*="email" i]',
        ];
        const input = await waitForAny(candidateSelectors, 8000);

        if (!input) {
            const inputs = [...document.querySelectorAll('input, textarea, [contenteditable="true"]')].map(describeInput);
            console.warn('[saf-auto] No email input matched. All inputs on page:', inputs);
            setStatus('Could not find search input — check console DOM dump and share it.', 'error');
            clearAutoSearch();
            return;
        }

        input.focus();
        await sleep(150);
        await typeIntoReactInput(input, email);
        await sleep(300);
        input.focus();

        const enterInit = {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            bubbles: true, cancelable: true,
        };
        input.dispatchEvent(new KeyboardEvent('keydown', enterInit));
        input.dispatchEvent(new KeyboardEvent('keypress', enterInit));
        input.dispatchEvent(new KeyboardEvent('keyup', enterInit));

        const form = input.closest('form');
        if (form) {
            try { form.requestSubmit(); } catch {}
        }

        clearAutoSearch();
        setStatus(`Search submitted for ${email}`, 'success');
    };

    (async () => {
        const url = new URL(location.href);
        const autoLoginParam = url.searchParams.get('sgrAutoLogin');
        const autoSearchParam = url.searchParams.get('sgrAutoSearch');

        if (autoLoginParam) {
            stashAutoLogin(autoLoginParam);
            stripParam('sgrAutoLogin');
            resetNavAttempts();
        }
        if (autoSearchParam) {
            stashAutoSearch(autoSearchParam);
            stripParam('sgrAutoSearch');
        }

        const pendingLogin = readAutoLogin();
        const pendingSearch = readAutoSearch();

        if (!pendingLogin && !pendingSearch) return;

        if (pendingLogin) {
            const m = pendingLogin.match(/^ecom-prod-(eu|us)-\d+$/);
            if (m) ui.region.value = m[1];
            ui.result.textContent = `Sub-Account: ${pendingLogin}`;
            ui.result.classList.remove('is-empty');

            const attempts = getNavAttempts();
            if (attempts >= MAX_NAV_ATTEMPTS) {
                clearAutoLogin();
                clearAutoSearch();
                resetNavAttempts();
                setStatus(`Gave up after ${attempts} navigation attempts. You're likely locked into a sub-user session with no return path — sign out of SendGrid entirely and sign back in as the parent account, then click the C-Series button again.`, 'error');
                return;
            }

            const returnCtrl = findReturnToParentControl();
            if (returnCtrl) {
                bumpNavAttempts();
                setStatus(`Returning to main account (attempt ${attempts + 1}/${MAX_NAV_ATTEMPTS})…`, 'info');
                await sleep(300);
                returnCtrl.click();
                return;
            }

            if (!/^\/(subuser\/access|settings\/subusers)/.test(location.pathname)) {
                bumpNavAttempts();
                setStatus(`Navigating to /subuser/access (attempt ${attempts + 1}/${MAX_NAV_ATTEMPTS})…`, 'info');
                await sleep(300);
                location.href = '/subuser/access';
                return;
            }

            setStatus('Waiting for sub-user picker to render…', 'info');
            const listReady = await waitForAny([SELECTORS.subuserRow, SELECTORS.loadMore], 12000);
            if (!listReady) {
                const sample = document.body ? document.body.outerHTML.slice(0, 2000) : '(no body)';
                console.warn('[saf-auto] picker selectors missed on', location.pathname, '— DOM sample:', sample);
                clearAutoLogin();
                clearAutoSearch();
                resetNavAttempts();
                setStatus(`Sub-user picker DOM didn't match expected selectors on ${location.pathname}. Console has a DOM dump — share it and I'll adjust selectors.`, 'error');
                return;
            }
            resetNavAttempts();

            setStatus(`Logging in to ${pendingLogin}…`, 'info');
            clearAutoLogin();
            const ok = await loginToSlug(pendingLogin);
            if (!ok) {
                clearAutoSearch();
                setStatus(`Auto-login FAILED for ${pendingLogin}. ${ui.status.textContent || ''}`.trim(), 'error');
            }
            return;
        }

        if (pendingSearch) {
            if (/^\/(email_logs|email_activity|activity)/i.test(location.pathname)) {
                setStatus(`Auto-search: ${pendingSearch}`, 'info');
                await runAutoSearch(pendingSearch);
            } else {
                setStatus(`Navigating to /email_logs for ${pendingSearch}…`, 'info');
                await sleep(1200);
                location.href = '/email_logs';
            }
        }
    })();

    function runCSeriesSide() {
        const isOrderPage = () => /^\/admin\/orders\/[^/]+/.test(location.pathname);
        const C_PREFIX = 'cssgb';
        const C_SHARDS = { eu: 6, us: 4 };
        const PRODUCT_TO_REGION = {
            'ecom-eu': 'eu',
            'ecom-na': 'us',
            'ecom-us': 'us',
        };
        const SIDEBAR_SEL = '.Border.Rounded.BoxShadow1.Background-lotus.mussel.Border-lotusDark';
        const BTN_ROW_SEL = '.Flex.FlexRow.FlexWrap.BorderTop.Border-moses.P-half';
        const EMAIL_SEL = 'a[href^="mailto:"]';

        const style = document.createElement('style');
        style.textContent = `
            .${C_PREFIX}-btn {
                background: #1a82e2 !important;
                color: #fff !important;
                border-color: #1571c4 !important;
            }
            .${C_PREFIX}-btn:hover { background: #1571c4 !important; }
            .${C_PREFIX}-btn[aria-disabled="true"] { opacity: 0.6; cursor: not-allowed; }
        `;
        document.head.appendChild(style);

        const readShop = () => {
            const shop = window.SEOshop?.data?.shop || window.SEOshop?.react?.shop;
            const product = (window.SEOshop?.services?.identity?.productName || '').toLowerCase();
            const region = PRODUCT_TO_REGION[product] || null;
            return { id: shop?.id ?? null, region, product };
        };

        const computeSlug = (shopId, region) => {
            const mod = C_SHARDS[region];
            if (!mod || !Number.isInteger(shopId)) return null;
            return `ecom-prod-${region}-${shopId % mod}`;
        };

        const buildButtonNode = (onClick) => {
            const wrap = document.createElement('div');
            wrap.className = `W-12 W-6--m P-half ${C_PREFIX}-wrap`;
            const btn = document.createElement('a');
            btn.className = `btn block -small ${C_PREFIX}-btn`;
            btn.href = '#';
            btn.textContent = 'Check SendGrid';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                onClick(btn);
            });
            wrap.appendChild(btn);
            return wrap;
        };

        const setBtnState = (btn, text, disabled) => {
            btn.textContent = text;
            if (disabled) btn.setAttribute('aria-disabled', 'true');
            else btn.removeAttribute('aria-disabled');
        };

        const handleClick = (btn, email) => {
            const { id, region, product } = readShop();
            if (!id || !region) {
                alert(`Cannot open SendGrid:\n  shop.id = ${id}\n  productName = ${product || '(none)'}\n\nSEOshop globals not ready, or productName is not one of: ${Object.keys(PRODUCT_TO_REGION).join(', ')}.`);
                return;
            }
            const slug = computeSlug(id, region);
            if (!slug) {
                alert(`Cannot compute sub-account slug for shopId=${id} region=${region}`);
                return;
            }
            const url = new URL('https://app.sendgrid.com/subuser/access');
            url.searchParams.set('sgrAutoLogin', slug);
            if (email) url.searchParams.set('sgrAutoSearch', email);
            setBtnState(btn, `Opening… (${slug})`, true);
            window.open(url.toString(), '_blank', 'noopener');
            setTimeout(() => setBtnState(btn, 'Check SendGrid', false), 1500);
        };

        const inject = (sidebar, emailLink) => {
            if (sidebar.querySelector(`.${C_PREFIX}-wrap`)) return;
            const email = (emailLink.textContent || '').trim();
            const rows = sidebar.querySelectorAll(BTN_ROW_SEL);
            const targetRow = rows[rows.length - 1];
            if (!targetRow) {
                console.warn('[saf] no button row matched', BTN_ROW_SEL, '— sidebar HTML:', sidebar.outerHTML.slice(0, 500));
                return;
            }
            const node = buildButtonNode((b) => handleClick(b, email));
            targetRow.appendChild(node);
        };

        const waitForEl = (selector, timeout = 15000) =>
            new Promise((resolve) => {
                const found = document.querySelector(selector);
                if (found) return resolve(found);
                const mo = new MutationObserver(() => {
                    const f = document.querySelector(selector);
                    if (f) { mo.disconnect(); resolve(f); }
                });
                mo.observe(document.documentElement, { childList: true, subtree: true });
                if (timeout) setTimeout(() => { mo.disconnect(); resolve(null); }, timeout);
            });

        const attempt = async () => {
            const emailLink = await waitForEl(EMAIL_SEL);
            if (!emailLink) {
                console.warn('[saf] no mailto link found within 15s');
                return;
            }
            const sidebar = emailLink.closest(SIDEBAR_SEL);
            if (!sidebar) {
                console.warn('[saf] mailto found but no ancestor matched', SIDEBAR_SEL, '— walking up:', emailLink.parentElement?.outerHTML?.slice(0, 200));
                return;
            }
            inject(sidebar, emailLink);
        };

        const maybeAttempt = () => { if (isOrderPage()) attempt(); };
        maybeAttempt();

        let lastUrl = location.href;
        const onMaybeNav = () => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                maybeAttempt();
            }
        };
        new MutationObserver(onMaybeNav)
            .observe(document.documentElement, { childList: true, subtree: true });

        const origPush = history.pushState;
        const origReplace = history.replaceState;
        history.pushState = function () { const r = origPush.apply(this, arguments); onMaybeNav(); return r; };
        history.replaceState = function () { const r = origReplace.apply(this, arguments); onMaybeNav(); return r; };
        window.addEventListener('popstate', onMaybeNav);
    }
})();
