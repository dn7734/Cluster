/**
 * НАУКОВО-МЕТОДИЧНИЙ ОПИС МОДУЛЯ (script.js):
 * Клієнтське ядро управління об'єктною моделлю документа (DOM) платформи «AgroCluster Analytics».
 * Виділений серверний вузол: https://cluster-fcsu.onrender.com
 */

document.addEventListener("DOMContentLoaded", () => {
    const BACKEND_URL = "https://cluster-fcsu.onrender.com";

    const LOCAL_COMPANIES = {
        "00496802": {
            edrpou: "00496802",
            company_name: "ННЦ «ІНСТИТУТ ЗЕМЛЕРОБСТВА НААН»",
            kved: "72.19 Дослідження й експериментальні розробки у сфері природничих і технічних наук",
            region: "Київська обл., смт Чабани",
            activity_type: "Наукове ядро: Супереліта (1–5 га)",
            own_contribution_percent: "25% (ОІВ + селекція)",
            investment_focus: "Трансфер патенту сорту гірчиці «Біла Принцеса» та авторський нагляд"
        },
        "40125890": {
            edrpou: "40125890",
            company_name: "ТОВ «ІНСТИТУТ ІННОВАЦІЙНОЇ БІОЕКОНОМІКИ» (ІІБ)",
            kved: "70.22 Консультування з питань комерційної діяльності й керування",
            region: "м. Київ",
            activity_type: "Координатор кластеру: Драфт і Тизер",
            own_contribution_percent: "20% (Інжиніринг)",
            investment_focus: "Маркетингова упаковка стартапів НААН та виведення тизерів на грантові платформи"
        },
        "03728915": {
            edrpou: "03728915",
            company_name: "ФГ «ПОДІЛЬСЬКИЙ КОЛОС»",
            kved: "01.11 Вирощування зернових і технічних культур (насінництво)",
            region: "Вінницька область",
            activity_type: "Насінництво та товарні посіви (Еліта / РС-1)",
            own_contribution_percent: "30% (Агровиробництво)",
            investment_focus: "Масштабування посівів сорту «Біла Принцеса» за форвардним замовленням"
        },
        "41258963": {
            edrpou: "41258963",
            company_name: "ТОВ «АГРО-ЕКО ПЕРЕРОБКА»",
            kved: "10.41 Виробництво олії та тваринних жирів / Глибока переробка",
            region: "Черкаська область",
            activity_type: "Переробний завод (Олія, порошок, шрот)",
            own_contribution_percent: "35% (Лінія переробки)",
            investment_focus: "Глибока безвідходна переробка товарного зерна гірчиці «Біла Принцеса»"
        }
    };

    const WL_THEMES = {
        iib: {
            title: "AgroCluster Analytics • ТОВ «Інститут інноваційної біоекономіки» & НААН",
            sub: "White-Label платформа комерціалізації наукових розробок: Драфт → Тизер → Замовлення за Маржею",
            accent: "#059669", dark: "#0f172a"
        },
        naan: {
            title: "Селекційний Хаб • ННЦ «Інститут землеробства НААН»",
            sub: "Платформа авторського нагляду, ліцензування ОІВ та передзамовлення насіння «Біла Принцеса»",
            accent: "#0284c7", dark: "#0c4a6e"
        },
        agrotech: {
            title: "Трансферно-технологічний комплекс «Агротехнополіс»",
            sub: "Цифрова екосистема електронного дорадництва, кооперативного пулу та глибокої біопереробки",
            accent: "#4f46e5", dark: "#1e1b4b"
        }
    };

    let currentProfile = LOCAL_COMPANIES["00496802"];
    let calcState = {};
    let compareChart = null;
    let serverLoggingAvailable = true;

    async function logAction(actionName, detailsStr) {
        const entry = {
            timestamp: new Date().toLocaleString('uk-UA'),
            action: actionName,
            details: detailsStr
        };
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

    document.getElementById('wlSelect').addEventListener('change', (e) => {
        const t = WL_THEMES[e.target.value] || WL_THEMES.iib;
        document.getElementById('brandTitle').textContent = t.title;
        document.getElementById('brandSub').textContent = t.sub;
        document.documentElement.style.setProperty('--accent-green', t.accent);
        document.documentElement.style.setProperty('--accent-dark', t.dark);
        logAction('WHITE_LABEL_SWITCH', `Обрано брендинг: ${e.target.value}`);
    });

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
            cost1, rev1, mar1, prepaySum,
            cost2, rev2, mar2,
            cost3, rev3, mar3,
            cost4, rev4, mar4,
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

        renderComparisonChart(rawOnlyMargin, totalMargin);
    }

    function renderComparisonChart(rawMargin, clusterMargin) {
        const ctx = document.getElementById('marginCompareChart');
        const rawMln = +(rawMargin / 1000000).toFixed(2);
        const clMln = +(clusterMargin / 1000000).toFixed(2);

        if (compareChart) {
            compareChart.data.datasets[0].data = [rawMln, clMln];
            compareChart.update();
            return;
        }

        compareChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Без кластеру (Продаж сировини)', 'Кластер НААН–ІІБ (Насіння + Переробка)'],
                datasets: [{
                    label: 'Чиста маржа (млн грн)',
                    data: [rawMln, clMln],
                    backgroundColor: ['#94a3b8', '#059669'],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, title: { display: true, text: 'млн грн' } } }
            }
        });
    }

    [slArea, slYield, slProc, slPrepay].forEach(el => {
        el.addEventListener('input', recalcClusterEconomics);
        el.addEventListener('change', () => {
            logAction('CALC_SIMULATION', `Площа: ${calcState.area} га, Переробка: ${calcState.procPct}%, Маржа: ${fmtMln(calcState.totalMargin)}`);
        });
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
            const comp = LOCAL_COMPANIES[code];
            updateProfileUI(comp);
            logAction('EDRPOU_VERIFIED', `ЄДРПОУ ${code}: ${comp.company_name}`);
            addChatMsg(
                'AgroCluster НААН–ІІБ',
                `Верифіковано учасника кластеру: <strong>${comp.company_name}</strong> (ЄДРПОУ ${comp.edrpou}).<br>` +
                `• Чиста маржа кластеру (${calcState.area} га): <strong>${fmtMln(calcState.totalMargin)}</strong> (ROI ${calcState.roi}%).<br>` +
                `• Гарантований аванс селекції НААН: <strong>${fmtMln(calcState.prepaySum)}</strong>.<br>` +
                `• Приріст прибутку від цифровізації (E₂): <strong>+${fmtMln(calcState.effectE2)}/рік</strong>.`
            );
            return;
        }

        if (code) {
            const customComp = {
                edrpou: code,
                company_name: `АГРОПАРТНЕР КЛАСТЕРУ (ЄДРПОУ ${code})`,
                kved: "01.11 / 10.41 Вирощування та переробка олійних культур",
                region: "Україна",
                activity_type: "Учасник виробничо-переробного циклу",
                own_contribution_percent: "30%",
                investment_focus: clean
            };
            updateProfileUI(customComp);
            logAction('EDRPOU_CUSTOM', `Новий учасник ЄДРПОУ ${code}`);
        } else {
            logAction('CHAT_QUERY', clean);
        }

        addChatMsg(
            'AgroCluster НААН–ІІБ',
            `Параметри інтегровано до економічної моделі сорту «Біла Принцеса». Сукупна маржа: <strong>${fmtMln(calcState.totalMargin)}</strong> (ROI ${calcState.roi}%).`
        );
    }

    document.getElementById('sendBtn').addEventListener('click', () => {
        const inp = document.getElementById('textInput');
        handleUserQuery(inp.value);
        inp.value = '';
    });
    document.getElementById('textInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { handleUserQuery(e.target.value); e.target.value = ''; }
    });
    document.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', () => handleUserQuery(btn.getAttribute('data-query')));
    });

    async function exportHtmlToPdf(htmlContent, fileName) {
        const wrapper = document.getElementById('pdfOverlayWrapper');
        const target = document.getElementById('pdfRenderTarget');
        const prevScrollY = window.scrollY;

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
            window.scrollTo(0, prevScrollY);
        }
    }

    document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
        const btn = document.getElementById('downloadPdfBtn');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Формую Драфт...';
        logAction('PDF_DRAFT_GENERATED', `ЄДРПОУ: ${currentProfile.edrpou}, Площа: ${calcState.area} га, Маржа: ${fmtMln(calcState.totalMargin)}`);

        try {
            const nowStr = new Date().toLocaleDateString('uk-UA');
            const draftHtml = `
                <div style="border-bottom: 3px solid #059669; padding-bottom: 10px; margin-bottom: 14px;">
                    <div style="font-size: 10px; color: #059669; font-weight: bold; text-transform: uppercase;">Офіційний драфт кластерного проєкту • ТОВ «Інститут інноваційної біоекономіки» & НААН</div>
                    <h2 style="margin: 4px 0 0 0; font-size: 17px; color: #0f172a;">ЕСКІЗНИЙ ПРОЄКТ (ДРАФТ) ІННОВАЦІЙНОГО АГРАРНОГО КЛАСТЕРУ</h2>
                    <p style="margin: 4px 0 0 0; color: #475569; font-size: 11px;">Дата формування: ${nowStr} | Об'єкт трансферу ОІВ: Сорт гірчиці білої «Біла Принцеса»</p>
                </div>

                <h3 style="font-size: 13.5px; color: #059669; margin: 12px 0 6px 0;">1. Паспорт базового учасника кластеру</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11.5px;">
                    <tr><td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; width: 38%; background: #f8fafc;">Найменування суб'єкта (ЄДРПОУ)</td><td style="border: 1px solid #cbd5e1; padding: 6px;">${currentProfile.company_name} (ЄДРПОУ ${currentProfile.edrpou})</td></tr>
                    <tr><td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; background: #f8fafc;">Основний КВЕД та Регіон</td><td style="border: 1px solid #cbd5e1; padding: 6px;">${currentProfile.kved} | ${currentProfile.region}</td></tr>
                    <tr><td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; background: #f8fafc;">Роль у ланцюгу доданої вартості</td><td style="border: 1px solid #cbd5e1; padding: 6px;">${currentProfile.activity_type} (Внесок: ${currentProfile.own_contribution_percent})</td></tr>
                    <tr><td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; background: #f8fafc;">Фокус комерціалізації</td><td style="border: 1px solid #cbd5e1; padding: 6px;">${currentProfile.investment_focus}</td></tr>
                </table>

                <h3 style="font-size: 13.5px; color: #059669; margin: 12px 0 6px 0;">2. Економіко-математична модель масштабування (${calcState.area} га | Врожайність ${calcState.yld} т/га | Переробка ${calcState.procPct}%)</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11.5px;">
                    <tr style="background: #f1f5f9;">
                        <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">Етап ланцюга вартості</th>
                        <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">Масштаб у кластері</th>
                        <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">Витрати</th>
                        <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">Виручка</th>
                        <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">Чиста маржа</th>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;"><strong>І. Наукове ядро (НУС НААН)</strong></td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${calcState.superEliteHa} га Супереліти + Роялті</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${fmtMln(calcState.cost1)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${fmtMln(calcState.rev1)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #059669;">+${fmtMln(calcState.mar1)}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;"><strong>ІІ. Насінництво (Еліта)</strong></td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${calcState.eliteHa} га розмноження Еліти</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${fmtMln(calcState.cost2)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${fmtMln(calcState.rev2)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #059669;">+${fmtMln(calcState.mar2)}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;"><strong>ІІІ. Агровиробництво (РС-1)</strong></td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${calcState.area} га (${calcState.totalHarvestTons} т зерна)</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${fmtMln(calcState.cost3)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${fmtMln(calcState.rev3)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #059669;">+${fmtMln(calcState.mar3)}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;"><strong>IV. Глибока переробка</strong></td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">Олія, порошок, шрот (${calcState.procPct}%)</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${fmtMln(calcState.cost4)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px;">${fmtMln(calcState.rev4)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #059669;">+${fmtMln(calcState.mar4)}</td>
                    </tr>
                </table>

                <h3 style="font-size: 13.5px; color: #059669; margin: 12px 0 6px 0;">3. Зведені фінансові індикатори та ефект цифровізації (E₂)</h3>
                <div style="background: #ecfdf5; border: 1px solid #6ee7b7; padding: 12px; border-radius: 6px; font-size: 12px; line-height: 1.6;">
                    • <strong>Сукупна чиста маржа кластеру:</strong> ${fmtMln(calcState.totalMargin)} (Рентабельність циклу ROI: <strong>${calcState.roi}%</strong>)<br>
                    • <strong>Гарантована авансова передоплата НУС НААН на селекцію (${calcState.prepayPct}%):</strong> ${fmtMln(calcState.prepaySum)}<br>
                    • <strong>Економічний ефект від впровадження інформаційної системи (E₂):</strong> +${fmtMln(calcState.effectE2)}/рік (зниження трансакційних витрат на 15%)
                </div>
            `;
            await exportHtmlToPdf(draftHtml, 'AgroCluster_Draft_Project.pdf');
        } finally {
            btn.disabled = false;
            btn.textContent = orig;
        }
    });

    document.getElementById('downloadTeaserBtn').addEventListener('click', async () => {
        const btn = document.getElementById('downloadTeaserBtn');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Формую Pitch...';
        logAction('PDF_TEASER_GENERATED', `ЄДРПОУ: ${currentProfile.edrpou}, ROI: ${calcState.roi}%`);

        try {
            const nowStr = new Date().toLocaleDateString('uk-UA');
            const teaserHtml = `
                <div style="background: #0f172a; color: #ffffff; padding: 18px 20px; border-radius: 8px; border-bottom: 4px solid #059669; margin-bottom: 16px;">
                    <div style="font-size: 10.5px; color: #34d399; text-transform: uppercase; letter-spacing: 0.8px; font-weight: bold;">INVESTMENT TEASER & PITCH DECK • ТОВ «ІНСТИТУТ ІННОВАЦІЙНОЇ БІОЕКОНОМІКИ»</div>
                    <h1 style="margin: 6px 0 4px 0; font-size: 19px;">БІОЕКОНОМІЧНИЙ КЛАСТЕР «БІЛА ПРИНЦЕСА» (НААН & ІІБ)</h1>
                    <div style="font-size: 11.5px; color: #cbd5e1;">Масштабування української селекції у високомаржинальну переробку (Олія • Порошок • Кормовий шрот)</div>
                </div>

                <div style="display: flex; gap: 10px; margin-bottom: 16px;">
                    <div style="flex: 1; background: #ecfdf5; border: 1px solid #6ee7b7; padding: 12px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 10px; color: #047857; text-transform: uppercase; font-weight: bold;">Чиста маржа проєкту</div>
                        <div style="font-size: 18px; font-weight: bold; color: #059669; margin-top: 4px;">${fmtMln(calcState.totalMargin)}</div>
                    </div>
                    <div style="flex: 1; background: #eff6ff; border: 1px solid #93c5fd; padding: 12px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 10px; color: #1d4ed8; text-transform: uppercase; font-weight: bold;">Рентабельність (ROI)</div>
                        <div style="font-size: 18px; font-weight: bold; color: #2563eb; margin-top: 4px;">${calcState.roi}% річних</div>
                    </div>
                    <div style="flex: 1; background: #fef3c7; border: 1px solid #fcd34d; padding: 12px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 10px; color: #b45309; text-transform: uppercase; font-weight: bold;">Аванс науці (НААН)</div>
                        <div style="font-size: 18px; font-weight: bold; color: #d97706; margin-top: 4px;">${fmtMln(calcState.prepaySum)}</div>
                    </div>
                </div>

                <h3 style="font-size: 13px; color: #0f172a; border-left: 4px solid #059669; padding-left: 8px; margin: 12px 0 6px 0;">1. Проблема ринку та Інноваційне рішення ІІБ</h3>
                <p style="font-size: 11.5px; line-height: 1.5; color: #334155; margin: 0 0 12px 0;">
                    Наукові установи генерують високопродуктивні сорти, проте разовий продаж насіння не створює стійкого бізнесу. <strong>ТОВ «Інститут інноваційної біоекономіки»</strong> об'єднує запатентований сорт гірчиці «Біла Принцеса» (ННЦ «Інститут землеробства НААН») у замкнений промисловий кластер площею <strong>${calcState.area} га</strong> (валовий збір <strong>${calcState.totalHarvestTons} т</strong>) із глибокою переробкою (${calcState.procPct}%) та гарантованою передоплатою селекції (${calcState.prepayPct}%).
                </p>

                <h3 style="font-size: 13px; color: #0f172a; border-left: 4px solid #059669; padding-left: 8px; margin: 12px 0 6px 0;">2. Матриця розподілу чистої маржі за ланками кластеру</h3>
                <ul style="font-size: 11.5px; line-height: 1.6; color: #334155; margin: 0 0 14px 0;">
                    <li><strong>Наукове ядро (НУС НААН):</strong> ${calcState.superEliteHa} га Супереліти + роялті = <strong>+${fmtMln(calcState.mar1)}</strong> чистої маржі.</li>
                    <li><strong>Насінницькі господарства:</strong> ${calcState.eliteHa} га Еліти = <strong>+${fmtMln(calcState.mar2)}</strong> чистої маржі.</li>
                    <li><strong>Товарне агровиробництво:</strong> ${calcState.area} га РС-1 = <strong>+${fmtMln(calcState.mar3)}</strong> чистої маржі.</li>
                    <li><strong>Завод глибокої переробки:</strong> Олія, порошок, кормовий шрот = <strong>+${fmtMln(calcState.mar4)}</strong> чистої маржі.</li>
                    <li><strong>Додатковий ефект цифровізації управління (E₂):</strong> <strong>+${fmtMln(calcState.effectE2)}/рік</strong>.</li>
                </ul>

                <div style="border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 11px; color: #475569; display: flex; justify-content: space-between;">
                    <span>Базовий учасник: ${currentProfile.company_name} (ЄДРПОУ ${currentProfile.edrpou})</span>
                    <span>Дата: ${nowStr} • Готово для подання у грантовий модуль AgroGrant_Bot</span>
                </div>
            `;
            await exportHtmlToPdf(teaserHtml, 'AgroCluster_Investment_Pitch_Deck.pdf');
        } finally {
            btn.disabled = false;
            btn.textContent = orig;
        }
    });

    document.getElementById('downloadDocxBtn').addEventListener('click', () => {
        logAction('DOCX_EXPORT_REQUEST', `ЄДРПОУ: ${currentProfile.edrpou}, Площа: ${calcState.area} га`);
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
        logAction('BRIDGE_TO_GRANTBOT', `ЄДРПОУ: ${currentProfile.edrpou}, Маржа: ${fmtMln(calcState.totalMargin)}`);
        const payload = encodeURIComponent(
            `Код ЄДРПОУ ${currentProfile.edrpou}, ${currentProfile.company_name}. ` +
            `Проєкт кластеру «Біла Принцеса»: площа ${calcState.area} га, чиста маржа ${fmtMln(calcState.totalMargin)}, ` +
            `ROI ${calcState.roi}%, передоплата селекції НААН ${fmtMln(calcState.prepaySum)}.`
        );
        window.open(`https://dn7734.github.io/AgroGrant_Bot/?data=${payload}`, '_blank');
    });

    logAction('SESSION_START', 'Модульне клієнтське ядро платформи успішно ініціалізовано');
});
