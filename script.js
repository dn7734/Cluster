/**
 * Клієнтське ядро платформи AgroCluster Analytics (v2.1).
 * Спрямовано на ізольований сервер https://cluster-fcsu.onrender.com.
 */
document.addEventListener("DOMContentLoaded", () => {
    const BACKEND_URL = "https://cluster-fcsu.onrender.com";

    const LOCAL_COMPANIES = {
        "00496802": {
            edrpou: "00496802",
            company_name: "ННЦ «ІНСТИТУТ ЗЕМЛЕРОБСТВА НААН»",
            kved: "72.19 Дослідження й експериментальні розробки",
            region: "Київська обл., смт Чабани",
            activity_type: "Наукове ядро: Супереліта (1–5 га)",
            own_contribution_percent: "25% (ОІВ + селекція)",
            investment_focus: "Трансфер патенту сорту гірчиці «Біла Принцеса» та авторський нагляд"
        },
        "40125890": {
            edrpou: "40125890",
            company_name: "ТОВ «ІНСТИТУТ ІННОВАЦІЙНОЇ БІОЕКОНОМІКИ» (ІІБ)",
            kved: "70.22 Консультування з питань комерційної діяльності",
            region: "м. Київ",
            activity_type: "Координатор кластеру: Драфт і Тизер",
            own_contribution_percent: "20% (Інжиніринг)",
            investment_focus: "Маркетингова упаковка стартапів НААН та виведення тизерів на грантові платформи"
        },
        "03728915": {
            edrpou: "03728915",
            company_name: "ФГ «ПОДІЛЬСЬКИЙ КОЛОС»",
            kved: "01.11 Вирощування зернових і технічних культур",
            region: "Вінницька область",
            activity_type: "Насінництво та товарні посіви (Еліта / РС-1)",
            own_contribution_percent: "30% (Агровиробництво)",
            investment_focus: "Масштабування посівів сорту «Біла Принцеса» за форвардним замовленням"
        },
        "41258963": {
            edrpou: "41258963",
            company_name: "ТОВ «АГРО-ЕКО ПЕРЕРОБКА»",
            kved: "10.41 Виробництво олії та тваринних жирів",
            region: "Черкаська область",
            activity_type: "Переробний завод (Олія, порошок, шрот)",
            own_contribution_percent: "35% (Лінія переробки)",
            investment_focus: "Глибока безвідходна переробка товарного зерна гірчиці «Біла Принцеса»"
        }
    };

    let currentProfile = LOCAL_COMPANIES["00496802"];
    let calcState = {};
    let compareChart = null;
    let serverLoggingAvailable = true;

    async function logAction(actionName, detailsStr) {
        const entry = { timestamp: new Date().toLocaleString('uk-UA'), action: actionName, details: detailsStr };
        try {
            const localLogs = JSON.parse(localStorage.getItem('agrocluster_logs') || '[]');
            localLogs.unshift(entry);
            localStorage.setItem('agrocluster_logs', JSON.stringify(localLogs.slice(0, 100)));
        } catch (err) {}

        if (!serverLoggingAvailable) return;
        try {
            const res = await fetch(`${BACKEND_URL}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: actionName, details: detailsStr })
            });
            if (res.status === 404) serverLoggingAvailable = false;
        } catch (e) {
            serverLoggingAvailable = false;
        }
    }

    function fmtMln(val) {
        if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(2) + ' млн грн';
        return Math.round(val / 1000) + ' тис. грн';
    }

    const slArea = document.getElementById('slArea');
    const slYield = document.getElementById('slYield');
    const slProc = document.getElementById('slProc');
    const slPrepay = document.getElementById('slPrepay');

    function recalcClusterEconomics() {
        const area = parseFloat(slArea.value);
        const yld = parseFloat(slYield.value);
        const procPct = parseFloat(slProc.value) / 100.0;
        const prepayPct = parseFloat(slPrepay.value) / 100.0;

        document.getElementById('valArea').textContent = area;
        document.getElementById('valYield').textContent = yld.toFixed(1);
        document.getElementById('valProc').textContent = Math.round(procPct * 100);
        document.getElementById('valPrepay').textContent = Math.round(prepayPct * 100);

        const eliteHa = Math.max(5, Math.round(area / 20));
        const superEliteHa = Math.max(1.0, +(eliteHa / 15).toFixed(1));
        document.getElementById('seedChainHint').textContent =
            `Потреба насінницької бази: ${superEliteHa} га Супереліти (НААН) → ${eliteHa} га Еліти → ${area} га РС-1`;

        const totalHarvestTons = Math.round(area * yld);
        const cost1 = Math.round(superEliteHa * 180000);
        const rev1 = Math.round((superEliteHa * 950000) + (area * 4750));
        const mar1 = rev1 - cost1;
        const prepaySum = Math.round(rev1 * prepayPct);

        const cost2 = Math.round(eliteHa * 30000);
        const rev2 = Math.round(eliteHa * 130000);
        const mar2 = rev2 - cost2;

        const cost3 = Math.round(area * 24000);
        const rev3 = Math.round(totalHarvestTons * 24000);
        const mar3 = rev3 - cost3;

        const tonsProcessed = totalHarvestTons * procPct;
        const cost4 = Math.round(tonsProcessed * 22000);
        const rev4 = Math.round(tonsProcessed * 41000);
        const mar4 = rev4 - cost4;

        const totalCost = cost1 + cost2 + cost3 + cost4;
        const totalRev = rev1 + rev2 + rev3 + rev4;
        const totalMargin = mar1 + mar2 + mar3 + mar4;
        const rawOnlyMargin = Math.round(mar1 * 0.4 + mar3);
        const roi = Math.round((totalMargin / Math.max(1, totalCost)) * 100);
        const effectE2 = Math.round(totalMargin * 0.15);

        calcState = {
            area, yld, procPct: Math.round(procPct * 100), prepayPct: Math.round(prepayPct * 100),
            superEliteHa, eliteHa, totalHarvestTons,
            cost1, rev1, mar1, prepaySum, cost2, rev2, mar2, cost3, rev3, mar3, cost4, rev4, mar4,
            totalCost, totalRev, totalMargin, rawOnlyMargin, roi, effectE2
        };

        document.getElementById('kpiHarvest').textContent = `${totalHarvestTons} т`;
        document.getElementById('kpiMargin').textContent = fmtMln(totalMargin);
        document.getElementById('kpiPrepaySum').textContent = fmtMln(prepaySum);
        document.getElementById('kpiEffectE2').textContent = '+' + fmtMln(effectE2);
        document.getElementById('calcSummaryBadge').textContent = `Рентабельність циклу (ROI): ${roi}%`;
        document.getElementById('p_margin_live').textContent = `${fmtMln(totalMargin)} (ROI ${roi}%)`;
        document.getElementById('p_size').textContent = `${area} га (${totalHarvestTons} т зерна)`;

        document.getElementById('tCost1').textContent = fmtMln(cost1);
        document.getElementById('tRev1').textContent = fmtMln(rev1);
        document.getElementById('tMar1').textContent = '+' + fmtMln(mar1);
        document.getElementById('tCost2').textContent = fmtMln(cost2);
        document.getElementById('tRev2').textContent = fmtMln(rev2);
        document.getElementById('tMar2').textContent = '+' + fmtMln(mar2);
        document.getElementById('tCost3').textContent = fmtMln(cost3);
        document.getElementById('tRev3').textContent = fmtMln(rev3);
        document.getElementById('tMar3').textContent = '+' + fmtMln(mar3);
        document.getElementById('tCost4').textContent = fmtMln(cost4);
        document.getElementById('tRev4').textContent = fmtMln(rev4);
        document.getElementById('tMar4').textContent = '+' + fmtMln(mar4);

        const ctx = document.getElementById('marginCompareChart');
        const rawMln = +(rawOnlyMargin / 1000000).toFixed(2);
        const clMln = +(totalMargin / 1000000).toFixed(2);
        if (compareChart) {
            compareChart.data.datasets[0].data = [rawMln, clMln];
            compareChart.update();
        } else {
            compareChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Без кластеру (Сировина)', 'Кластер НААН–ІІБ (Переробка)'],
                    datasets: [{ label: 'Чиста маржа (млн грн)', data: [rawMln, clMln], backgroundColor: ['#94a3b8', '#059669'], borderRadius: 6 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        }
    }

    [slArea, slYield, slProc, slPrepay].forEach(el => {
        el.addEventListener('input', recalcClusterEconomics);
        el.addEventListener('change', () => logAction('CALC_SIMULATION', `Area: ${calcState.area}ha, Margin: ${fmtMln(calcState.totalMargin)}`));
    });
    recalcClusterEconomics();

    function updateProfileUI(prof) {
        currentProfile = prof;
        document.getElementById('p_edrpou').textContent = prof.edrpou;
        document.getElementById('p_company').textContent = prof.company_name;
        document.getElementById('p_kved').textContent = prof.kved;
        document.getElementById('p_region').textContent = prof.region;
        document.getElementById('p_activity').textContent = prof.activity_type;
        document.getElementById('p_own').textContent = prof.own_contribution_percent;
        document.getElementById('p_focus').textContent = prof.investment_focus;
    }

    const chatbox = document.getElementById('chatbox');
    function addChatMsg(sender, htmlText) {
        const div = document.createElement('div');
        div.className = 'msg ' + (sender === 'Ви' ? 'user' : 'bot');
        div.innerHTML = `<strong>${sender}:</strong><br>${htmlText}`;
        chatbox.appendChild(div);
        chatbox.scrollTop = chatbox.scrollHeight;
    }

    function handleUserQuery(text) {
        const clean = text.trim();
        if (!clean) return;
        addChatMsg('Ви', clean);
        const match = clean.match(/\b(\d{8})\b/);
        const code = match ? match[1] : null;
        if (code && LOCAL_COMPANIES[code]) {
            updateProfileUI(LOCAL_COMPANIES[code]);
            logAction('EDRPOU_VERIFIED', `Code: ${code}`);
        }
        addChatMsg('AgroCluster НААН–ІІБ', `Верифіковано! Сукупна маржа кластеру (${calcState.area} га): <strong>${fmtMln(calcState.totalMargin)}</strong> (ROI ${calcState.roi}%).`);
    }

    document.getElementById('sendBtn').addEventListener('click', () => {
        const inp = document.getElementById('textInput');
        handleUserQuery(inp.value);
        inp.value = '';
    });
    document.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', () => handleUserQuery(btn.getAttribute('data-query')));
    });

    async function exportHtmlToPdf(htmlContent, fileName) {
        const wrapper = document.getElementById('pdfOverlayWrapper');
        const target = document.getElementById('pdfRenderTarget');
        target.innerHTML = htmlContent;
        wrapper.style.display = 'flex';
        window.scrollTo(0, 0);
        await new Promise(resolve => setTimeout(resolve, 150));
        try {
            await html2pdf().set({
                margin: [10, 10, 10, 10],
                filename: fileName,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0, scrollX: 0 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(target).save();
        } finally {
            wrapper.style.display = 'none';
            target.innerHTML = '';
        }
    }

    document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
        logAction('PDF_DRAFT_GENERATED', `EDRPOU: ${currentProfile.edrpou}`);
        const html = `
            <h2 style="color:#059669; margin-top:0;">ЕСКІЗНИЙ ПРОЄКТ (ДРАФТ) ІННОВАЦІЙНОГО АГРАРНОГО КЛАСТЕРУ</h2>
            <p><strong>Суб'єкт:</strong> ${currentProfile.company_name} (ЄДРПОУ ${currentProfile.edrpou})</p>
            <p><strong>Площа:</strong> ${calcState.area} га | <strong>Валовий збір:</strong> ${calcState.totalHarvestTons} т | <strong>Переробка:</strong> ${calcState.procPct}%</p>
            <p><strong>Сукупна чиста маржа кластеру:</strong> ${fmtMln(calcState.totalMargin)} (ROI ${calcState.roi}%)</p>
            <p><strong>Аванс науці (НААН):</strong> ${fmtMln(calcState.prepaySum)} | <strong>Ефект цифровізації (E₂):</strong> +${fmtMln(calcState.effectE2)}/рік</p>
        `;
        await exportHtmlToPdf(html, 'AgroCluster_Draft_Project.pdf');
    });

    document.getElementById('downloadTeaserBtn').addEventListener('click', async () => {
        logAction('PDF_TEASER_GENERATED', `ROI: ${calcState.roi}%`);
        const html = `
            <div style="background:#0f172a; color:#fff; padding:16px; border-radius:8px; margin-bottom:14px;">
                <h1 style="margin:0; font-size:18px;">INVESTMENT PITCH DECK • КЛАСТЕР «БІЛА ПРИНЦЕСА»</h1>
            </div>
            <p><strong>Чиста маржа проєкту:</strong> ${fmtMln(calcState.totalMargin)} (ROI ${calcState.roi}%)</p>
            <p><strong>Гарантована передоплата селекції НААН:</strong> ${fmtMln(calcState.prepaySum)}</p>
            <p><strong>Економічний ефект цифровізації (E₂):</strong> +${fmtMln(calcState.effectE2)}/рік</p>
        `;
        await exportHtmlToPdf(html, 'AgroCluster_Investment_Pitch_Deck.pdf');
    });

    document.getElementById('downloadDocxBtn').addEventListener('click', () => {
        logAction('DOCX_EXPORT_REQUEST', `EDRPOU: ${currentProfile.edrpou}`);
        const params = new URLSearchParams({
            edrpou: currentProfile.edrpou,
            company: currentProfile.company_name,
            area: calcState.area,
            margin: fmtMln(calcState.totalMargin),
            roi: calcState.roi,
            prepay: fmtMln(calcState.prepaySum)
        });
        window.open(`${BACKEND_URL}/export/00000000-0000-0000-0000-000000000000?${params.toString()}`, '_blank');
    });

    document.getElementById('bridgeBotBtn').addEventListener('click', () => {
        logAction('BRIDGE_TO_GRANTBOT', `EDRPOU: ${currentProfile.edrpou}`);
        const payload = encodeURIComponent(
            `Код ЄДРПОУ ${currentProfile.edrpou}, ${currentProfile.company_name}. ` +
            `Проєкт кластеру «Біла Принцеса»: площа ${calcState.area} га, чиста маржа ${fmtMln(calcState.totalMargin)}, ROI ${calcState.roi}%.`
        );
        window.open(`https://dn7734.github.io/AgroGrant_Bot/?data=${payload}`, '_blank');
    });
});
