// ==UserScript==
// @name         Sub-Account Finder + UI
// @namespace    http://tampermonkey.net/
// @version      1.0
// @author       Etooooo
// @description  Find SendGrid sub-accounts based on Shop ID and region
// @match        https://app.sendgrid.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const createElement = (tag, styles = {}, attributes = {}) => {
        const element = document.createElement(tag);
        Object.assign(element.style, styles);
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'textContent') {
                element.textContent = value;
            } else {
                element.setAttribute(key, value);
            }
        });
        return element;
    };

    const container = createElement('div', {
        position: 'fixed',
        top: '10px',
        left: '10px',
        padding: '10px',
        backgroundColor: '#f9f9f9',
        border: '1px solid #ccc',
        borderRadius: '8px',
        zIndex: '10000',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        width: '300px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#333'
    });

    const header = createElement('div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 0',
        borderBottom: '1px solid #ddd',
        marginBottom: '10px'
    });

    const minimizeButton = createElement('button', {
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        backgroundColor: '#ffcc00',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: '10px'
    }, { textContent: '-' });

    const title = createElement('span', { fontWeight: 'bold', fontSize: '16px' }, { textContent: 'Sub-Account Finder' });

    header.appendChild(minimizeButton);
    header.appendChild(title);
    container.appendChild(header);

    const content = createElement('div');

    const inputGroup = createElement('div', {
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '10px'
    });

    const shopIdInput = createElement('input', {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid #ccc',
        marginBottom: '10px',
        '-moz-appearance': 'textfield',
        '-webkit-appearance': 'none',
        appearance: 'textfield'
    }, {
        type: 'number',
        placeholder: 'Enter Shop ID'
    });

    const regionSelect = createElement('select', {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid #ccc'
    });
    regionSelect.innerHTML = '<option value="EU">EU</option><option value="us">US</option>';

    inputGroup.appendChild(shopIdInput);
    inputGroup.appendChild(regionSelect);
    content.appendChild(inputGroup);

    const resultDisplay = createElement('div', {
        padding: '8px',
        backgroundColor: '#f0f0f0',
        borderRadius: '4px',
        border: '1px solid #ddd',
        marginBottom: '10px'
    });

    const loginButton = createElement('button', {
        padding: '10px',
        backgroundColor: '#007bff',
        color: '#fff',
        borderRadius: '4px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '14px',
        textAlign: 'center',
        width: '100%'
    }, { textContent: 'Log In to Sub-Account' });

    content.appendChild(resultDisplay);
    content.appendChild(loginButton);
    container.appendChild(content);
    document.body.appendChild(container);

    let subAccount = '';

    function calculateSubAccount() {
    const shopId = parseInt(shopIdInput.value, 10);
    const region = regionSelect.value;
    const remainder = region === 'EU' ? shopId % 6 : shopId % 4;
    subAccount = `ecom-prod-${region}-${remainder}`;
    resultDisplay.textContent = `Sub-Account: ${subAccount}`;
}

    async function loadAllUsers() {
        let loadMoreButton;
        do {
            loadMoreButton = document.querySelector('button[data-qahook="loadMoreUsersButton"]');
            if (loadMoreButton) {
                loadMoreButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } while (loadMoreButton);
    }

    async function loginToSubAccount() {
        await loadAllUsers();

        const accountElement = [...document.querySelectorAll('[data-subuser-username]')]
            .find(element => element.getAttribute('data-subuser-username') === subAccount);

        if (accountElement) {
            const button = accountElement.querySelector('button[data-qahook="loginButton"]');
            if (button) {
                button.click();
            } else {
                alert(`Login button for sub-account ${subAccount} not found.`);
            }
        } else {
            alert(`Sub-account ${subAccount} not found.`);
        }
    }

    minimizeButton.addEventListener('click', () => {
        const isVisible = content.style.display !== 'none';
        content.style.display = isVisible ? 'none' : 'block';
        minimizeButton.textContent = isVisible ? '+' : '-';
    });

    shopIdInput.addEventListener('input', calculateSubAccount);
    regionSelect.addEventListener('change', calculateSubAccount);
    loginButton.addEventListener('click', loginToSubAccount);

})();
