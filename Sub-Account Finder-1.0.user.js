// ==UserScript==
// @name         Sub-Account Finder
// @namespace    http://tampermonkey.net/
// @version      1.0
// @author       Etooooo
// @description  Find SendGrid sub-accounts based on Shop ID and region.
// @match        https://app.sendgrid.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '10px';
    container.style.left = '10px';
    container.style.padding = '10px';
    container.style.backgroundColor = 'white';
    container.style.border = '1px solid black';
    container.style.zIndex = '10000';

    const shopIdInput = document.createElement('input');
    shopIdInput.type = 'number';
    shopIdInput.placeholder = 'Enter Shop ID';
    container.appendChild(shopIdInput);

    const regionSelect = document.createElement('select');
    regionSelect.style.width = '100px';
    regionSelect.innerHTML = '<option value="EU">EU</option><option value="NoAm">NoAm</option>';
    container.appendChild(regionSelect);

    const resultDisplay = document.createElement('div');
    resultDisplay.style.marginTop = '10px';
    container.appendChild(resultDisplay);

    document.body.appendChild(container);

    function calculateSubAccount() {
        const shopId = parseInt(shopIdInput.value, 10);
        const region = regionSelect.value;
        let subAccount = '';

        if (region === 'EU') {
            const remainder = shopId % 6;
            subAccount = `ecom-prod-eu-${remainder}`;
        } else if (region === 'NoAm') {
            const remainder = shopId % 4;
            subAccount = `ecom-prod-us-${remainder}`;
        }

        resultDisplay.textContent = `Sub-Account: ${subAccount}`;
    }

    shopIdInput.addEventListener('input', calculateSubAccount);
    regionSelect.addEventListener('change', calculateSubAccount);

})();