/**
 * НАУКОВО-МЕТОДИЧНИЙ ОПИС МОДУЛЯ (script.js):
 * Клієнтське ядро платформи «AgroCluster Analytics» (Версія 3.0 — Firebase Hosting + Google Cloud Run).
 * Реалізує:
 * 1. Економіко-математичну матрицю Драфту ТОВ «ІІБ» за даними «1_Драфт.pptx» (сорт «Біла Принцеса»);
 * 2. Парсер та галузевий верифікатор юридичних осіб України за ЄДРПОУ (Тільки Аграрії, Переробники та НУС НААН);
 * 3. Правило комерційного Оператора подачі (заміна бюджетної установи НААН на Провайдера ТОВ «ІІБ»);
 * 4. Вирізку Стартап-лотів під джерела фінансування (~100 тис. € грант, до 8 млн грн переробка, 50-км Off-take);
 * 5. Миттєву генерацію Драфту (PDF), Тизера Стартапу (PDF), Кластерної Угоди (DOCX) та Веб-Скоринг.
 */

document.addEventListener("DOMContentLoaded", () => {
    // Автоматичне визначення хмарного бекенду (Firebase Hosting / GitHub Pages або локальний API сервер)
    const isStaticHosting = window.location.hostname.includes("github.io") ||
                            window.location.hostname.includes("web.app") ||
                            window.location.hostname.includes("firebaseapp.com") ||
                            window.location.protocol === "file:";
    const BACKEND_URL = isStaticHosting ? "" : window.location.origin;

    const ALLOWED_AGRO_KVEDS = [
        "01.11", "01.13", "01.19", "01.21", "01.24", "01.25", "01.26", "01.28", "01.30",
        "01.41", "01.46", "01.47", "01.49", "01.50", "01.61", "01.63", "01.64",
        "02.10", "03.22", "10.41", "10.61", "10.84", "10.91", "20.15", "46.21", "70.22", "72.11", "72.19"
    ];

    const LOCAL_AGRO_COMPANIES = {
        "00496802": {
            edrpou: "00496802",
            company_name: "ННЦ «ІНСТИТУТ ЗЕМЛЕРОБСТВА НААН»",
            kved: "72.19 Дослідження й експериментальні розробки у сфері природничих і технічних наук",
            region: "Київська обл., смт Чабани",
            activity_type: "За кадром • Наукове ядро: ОІВ та Супереліта (1 га → 1,0 т)",
            own_contribution_percent: "25% (ОІВ Патент №180923 + авторський супровід)",
            investment_focus: "Оригінальне насіння сорту гірчиці білої «Біла Принцеса» (1 т супереліти на старт масштабування)",
            is_budget_institution: true
        },
        "40125890": {
            edrpou: "40125890",
            company_name: "ТОВ «ІНСТИТУТ ІННОВАЦІЙНОЇ БІОЕКОНОМІКИ» (ІІБ)",
            kved: "70.22 Інноваційний провайдинг та консалтинг біоекономічних кластерів",
            region: "м. Київ",
            activity_type: "Надбудова (Провайдер ІІБ): Драфт, Кластер і Оператор Гранту",
            own_contribution_percent: "20% (Інжиніринг, Драфт, Контрактація)",
            investment_focus: "Переклад наукової новації на мову маржі, збирання кластеру у 50-км зоні та подача стартап-лотів",
            is_budget_institution: false
        },
        "00496819": {
            edrpou: "00496819",
            company_name: "ДП «ДОСЛІДНЕ ГОСПОДАРСТВО \"ЧАБАНИ\" ННЦ \"ІЗ НААН\"»",
            kved: "01.64 Оброблення насіння для відтворення",
            region: "Київська обл., Фастівський р-н",
            activity_type: "Капсула І • Базове насінництво: Розмноження Еліти (200 га)",
            own_contribution_percent: "30% (Насінницька база та ЗАВ)",
            investment_focus: "Вирощування 120 т кондиційної Еліти та 180 т технічної фракції з 1 т супереліти",
            is_budget_institution: true
        },
        "03728915": {
            edrpou: "03728915",
            company_name: "ФГ «ПОДІЛЬСЬКИЙ КОЛОС»",
            kved: "01.11 Вирощування зернових (крім рису), бобових культур і насіння олійних культур",
            region: "Вінницька обл., Хмільницький р-н",
            activity_type: "Капсула ІІ • Фермерський пул СН-1 та Сидерація (у радіусі 50 км)",
            own_contribution_percent: "30% (Земельний банк, МТР, агротехніка)",
            investment_focus: "Масштабування сорту «Біла Принцеса» за форвардним Off-take контрактом та сидерація",
            is_budget_institution: false
        },
        "41258963": {
            edrpou: "41258963",
            company_name: "ТОВ «АГРО-ЕКО ПЕРЕРОБКА»",
            kved: "10.41 Виробництво олії та тваринних жирів / Глибока переробка",
            region: "Черкаська обл., м. Умань (50-км сировинна зона)",
            activity_type: "Капсула ІІІ (Вихід Б) • Завод глибокої переробки (Олія, порошок, шрот)",
            own_contribution_percent: "35% (Лінія фракціонування, пресування та помелу)",
            investment_focus: "Глибока переробка гірчиці «Біла Принцеса» (порошок 50%, олія 30%, шрот 15%) під експорт у ЄС",
            is_budget_institution: false
        },
        "31845620": {
            edrpou: "31845620",
            company_name: "ТОВ «НАСІННЄВА КОМПАНІЯ \"АГРО-ЕЛІТА ЦЕНТР\"»",
            kved: "01.64 Оброблення насіння для відтворення",
            region: "Черкаська обл., Звенигородський р-н",
            activity_type: "Капсула І • Приватне базове насіннєве господарство (Еліта 200 га)",
            own_contribution_percent: "35% (Насіннєвий завод та фасування 25 кг)",
            investment_focus: "Розмноження базового насіння (Еліта / СН-1) та фасування сидератних партій у мішки по 25 кг",
            is_budget_institution: false
        },
        "03754120": {
            edrpou: "03754120",
            company_name: "СТОВ «АГРОФІРМА \"СВІТАНОК\"»",
            kved: "01.11 Вирощування зернових (крім рису), бобових культур і насіння олійних культур",
            region: "Київська обл., Білоцерківський р-н",
            activity_type: "Капсула ІІ • Товарне агровиробництво та сидерація (1000 га)",
            own_contribution_percent: "30% (Власні обігові кошти та техніка)",
            investment_focus: "Вирощування 2 000 т товарної гірчиці за форвардним контрактом та фітосанітарна сидерація",
            is_budget_institution: false
        },
        "39584120": {
            edrpou: "39584120",
            company_name: "ТОВ «УКРАЇНСЬКИЙ ГІРЧИЧНИЙ ЗАВОД \"СПАЙС-ОЙЛ\"»",
            kved: "10.84 Виробництво прянощів і приправ",
            region: "Вінницька обл., м. Вінниця",
            activity_type: "Капсула ІІІ (Вихід Б) • Переробка на гірчичний порошок, олію та експорт ЄС",
            own_contribution_percent: "40% (Виробничі лінії та форвардний пул)",
            investment_focus: "Фракціонування за кольором і крупністю, виробництво порошку та олії для ринку Німеччини і Нідерландів",
            is_budget_institution: false
        },
        "36412580": {
            edrpou: "36412580",
            company_name: "ТОВ «ОРГАНІК СИДЕРАТ ПОЛІССЯ»",
            kved: "01.61 Допоміжна діяльність у рослинництві",
            region: "Житомирська обл., Житомирський р-н",
            activity_type: "Капсула ІІІ (Вихід А) • Сидеральні та фітосанітарні посіви",
            own_contribution_percent: "30% (Органічний земельний банк)",
            investment_focus: "Застосування сорту «Біла Принцеса» для відновлення азоту та боротьби з нематодами",
            is_budget_institution: false
        },
        "00497049": {
            edrpou: "00497049",
            company_name: "ІНСТИТУТ РОСЛИННИЦТВА ІМ. В.Я. ЮР'ЄВА НААН",
            kved: "72.19 Дослідження й експериментальні розробки у сфері природничих наук",
            region: "Харківська обл., м. Харків",
            activity_type: "Наукове ядро (НУС НААН): Генетичні ресурси та насінництво",
            own_contribution_percent: "25% (ОІВ та банк насіння)",
            investment_focus: "Збереження чистоти лінії сорту та авторський нагляд за розмноженням",
            is_budget_institution: true
        },
        "00497214": {
            edrpou: "00497214",
            company_name: "СЕЛЕКЦІЙНО-ГЕНЕТИЧНИЙ ІНСТИТУТ — НЦНС НААН",
            kved: "72.19 Дослідження й експериментальні розробки у сфері біологічних наук",
            region: "Одеська обл., м. Одеса",
            activity_type: "Наукове ядро (НУС НААН): Посухостійка селекція",
            own_contribution_percent: "25% (ОІВ + насіннєві розсадники)",
            investment_focus: "Адаптивні технології вирощування білої гірчиці в умовах степової зони",
            is_budget_institution: true
        },
        "03770142": {
            edrpou: "03770142",
            company_name: "ПП «АГРОЕКОЛОГІЯ»",
            kved: "01.11 Вирощування зернових і насіння олійних культур",
            region: "Полтавська обл., Шишацький р-н",
            activity_type: "Капсула ІІ • Товарні та органічні посіви СН-1 (Органік)",
            own_contribution_percent: "35% (Органічний земельний банк 8 000 га)",
            investment_focus: "Біофумігація ґрунтів та органічний експорт насіння гірчиці в ЄС",
            is_budget_institution: false
        },
        "03771540": {
            edrpou: "03771540",
            company_name: "СТОВ «АГРОФІРМА \"МАЯК\"»",
            kved: "01.11 Вирощування зернових і насіння олійних культур",
            region: "Полтавська обл., Котелевський р-н",
            activity_type: "Капсула ІІ • Товарне агровиробництво (2 000 га)",
            own_contribution_percent: "30% (Власна інфраструктура зберігання)",
            investment_focus: "Форвардний контракт на поставку 4 000 т гірчиці на переробний завод",
            is_budget_institution: false
        },
        "35118742": {
            edrpou: "35118742",
            company_name: "ТОВ «АГРО-РЕГІОН БОРИСПІЛЬ»",
            kved: "01.11 Вирощування зернових та олійних культур",
            region: "Київська обл., Бориспільський р-н",
            activity_type: "Капсула ІІ • Товарні посіви СН-1 та експортний трейдинг",
            own_contribution_percent: "30% (Логістичний комплекс)",
            investment_focus: "Масштабування вирощування «Білої Принцеси» під судновий експорт",
            is_budget_institution: false
        },
        "32759904": {
            edrpou: "32759904",
            company_name: "ТОВ «БАРИШІВСЬКА ЗЕРНОВА КОМПАНІЯ» (GRAIN ALLIANCE)",
            kved: "01.11 Вирощування зернових (крім рису), бобових та олійних культур",
            region: "Київська обл., Броварський р-н",
            activity_type: "Капсула ІІ • Товарні та насінницькі посіви у 50-км зоні",
            own_contribution_percent: "35% (Елеваторні потужності та техніка)",
            investment_focus: "Вирощування насіння РС-1 за європейськими стандартами якості",
            is_budget_institution: false
        },
        "31847120": {
            edrpou: "31847120",
            company_name: "ПРАТ «НВФ \"УРОЖАЙ\"»",
            kved: "01.11 Вирощування зернових культур",
            region: "Черкаська обл., м. Черкаси",
            activity_type: "Капсула ІІ • Агровиробничий кластерний пул (Черкащина)",
            own_contribution_percent: "30% (Земельний банк Черкащини)",
            investment_focus: "Контрактація посівів сорту «Біла Принцеса» для локального заводу переробки",
            is_budget_institution: false
        },
        "33654128": {
            edrpou: "33654128",
            company_name: "ТОВ «ПОДІЛЛЯ-ЗЕРНОПРОДУКТ»",
            kved: "01.11 Вирощування зернових і насіння олійних культур",
            region: "Хмельницька обл., м. Хмельницький",
            activity_type: "Капсула ІІ • Товарний агропул Хмельниччини",
            own_contribution_percent: "30% (Агровиробничі ресурси)",
            investment_focus: "Впровадження білої гірчиці у сівозміну як попередника озимих",
            is_budget_institution: false
        },
        "32145896": {
            edrpou: "32145896",
            company_name: "ТОВ «АГРОІНВЕСТ ДНІПРО»",
            kved: "01.11 Вирощування зернових і насіння олійних культур",
            region: "Дніпропетровська обл., Дніпровський р-н",
            activity_type: "Капсула ІІ • Товарні посіви в умовах східного Степу",
            own_contribution_percent: "30% (МТР та зрошувальні системи)",
            investment_focus: "Вирощування посухостійкого сорту «Біла Принцеса» для переробки",
            is_budget_institution: false
        },
        "36985214": {
            edrpou: "36985214",
            company_name: "ТОВ «ОЛІЙНОЕКСТРАКЦІЙНИЙ ЗАВОД \"ОЛІЯР-СХІД\"»",
            kved: "10.41 Виробництво олії та тваринних жирів",
            region: "Дніпропетровська обл., м. Кам'янське",
            activity_type: "Капсула ІІІ (Вихід Б) • Глибока переробка на олію та шрот",
            own_contribution_percent: "40% (Промисловий завод переробки)",
            investment_focus: "Контрактація 50-км сировинної зони для стабільного завантаження ліній",
            is_budget_institution: false
        },
        "31245879": {
            edrpou: "31245879",
            company_name: "ТОВ «ВОЛИНЬ-ЗЕРНО-ПРОДУКТ» (ТМ ВІЛІЯ)",
            kved: "01.11 Вирощування зернових та насіння олійних культур",
            region: "Волинська обл., м. Луцьк",
            activity_type: "Капсула І–ІІ • Насінництво, товарне вирощування та експорт ЄС",
            own_contribution_percent: "35% (Елеваторний та залізничний хаб)",
            investment_focus: "Прямий експорт партій олії та порошку до покупців у Євросоюзі",
            is_budget_institution: false
        },
        "35041289": {
            edrpou: "35041289",
            company_name: "ТОВ «ЧЕРНІГІВСЬКА ІНДУСТРІАЛЬНА МОЛОЧНА КОМПАНІЯ» (ІМК)",
            kved: "01.11 Вирощування зернових, бобових і насіння олійних культур",
            region: "Чернігівська обл., Чернігівський р-н",
            activity_type: "Капсула ІІ • Товарні посіви СН-1 та сидерація Полісся",
            own_contribution_percent: "30% (Земельні та тваринницькі комплекси)",
            investment_focus: "Замкнений цикл: вирощування насіння + споживання шроту на корм тваринам",
            is_budget_institution: false
        }
    };

    const NON_AGRO_REJECT_LIST = {
        "14360570": {
            company_name: "АТ КБ «ПРИВАТБАНК»",
            kved: "64.19 Інші види грошового посередництва",
            reason: "Банківська установа (Секція K). До кластеру допускаються виключно агровиробники (КВЕД 01.xx), заводи переробки (10.41/10.84/10.91) та наукові установи НААН."
        },
        "40075815": {
            company_name: "ТОВ «ЕПІЦЕНТР К»",
            kved: "47.52 Роздрібна торгівля будівельними матеріалами",
            reason: "Непродовольчий ритейл (Секція G). Основний КВЕД 47.52 не належить до аграрного виробництва або переробки."
        },
        "38567241": {
            company_name: "ТОВ «ІТ-СОФТ ДЕВЕЛОПМЕНТ»",
            kved: "62.01 Комп'ютерне програмування",
            reason: "ІТ-сектор (КВЕД 62.01). Не є суб'єктом агропромислового комплексу."
        }
    };

    const STARTUP_LOTS = {
        lot_100k_eur: {
            code: "lot_100k_eur",
            title: "Стартап-лот «Базова Еліта 200 га» (~100 000 € / 4,5–5,0 млн грн)",
            donor: "Міжнародні грантові платформи ЄС / Венчурний пул провайдингу ІІБ",
            amount: "100 000 € (~4,5–5,0 млн грн)",
            sliceDesc: "Вирізка Капсули І з Драфту: викуп стартової опції 1 т Супереліти ННЦ «ІЗ НААН» та закладання 200 га базового насінництва для отримання 120 т кондиційної Еліти і 180 т технічної фракції.",
            contractChain: "Ліцензійна угода НААН (паушальний збір 240 тис. грн + роялті 800 грн/га) + Форвардний контракт ІІБ із базовим господарством."
        },
        lot_8m_proc: {
            code: "lot_8m_proc",
            title: "Промисловий лот «Глибока переробка Zero-Waste» (до 8 000 000 грн)",
            donor: "Державна програма грантів на переробку / Співфінансування заводу",
            amount: "до 8 000 000 грн (безповоротно)",
            sliceDesc: "Вирізка Капсули ІІІ (Вихід Б): модульна лінія оптичного фракціонування гірчиці за крупністю і кольором, холодного пресування олії (30%), помелу порошку (50%) та грануляції кормового шроту (15%).",
            contractChain: "Довгостроковий Off-take контракт між заводом переробки, Провайдером ІІБ та пулом фермерів у радіусі 50 км."
        },
        lot_offtake_50km: {
            code: "lot_offtake_50km",
            title: "Негрантовий лот: Форвардне авансування від Заводу-переробника (Радіус 50 км)",
            donor: "Олійно-жировий комбінат / Імпортери Німеччини та Нідерландів",
            amount: "до 15 000 000 грн (товарний та грошовий аванс під урожай)",
            sliceDesc: "Вирізка Капсули ІІ–ІІІ: переробний завод авансує фермерів у радіусі 50 км сертифікованим насінням «Біла Принцеса» із заданою кислотністю й олійністю під 100% гарантований викуп товарного зерна.",
            contractChain: "Тристоронній форвардний договір: Завод-переробник ↔ ТОВ «ІІБ» (Провайдер) ↔ Фермерські господарства 50-км зони."
        },
        lot_siderat_25kg: {
            code: "lot_siderat_25kg",
            title: "Еко-лот «Сидеральний та Фітосанітарний конвеєр» (10 000 – 50 000 €)",
            donor: "Європейські програми біологізації землеробства та родючості ґрунтів",
            amount: "10 000 – 50 000 € (~0,45–2,25 млн грн)",
            sliceDesc: "Вирізка Капсули ІІІ (Вихід А): виробництво та фасування насіння І/ІІ репродукції у мішки по 25 кг (42 000 грн/т) для сидерації, відновлення азоту, боротьби з нематодами та медозбору.",
            contractChain: "Договори поставки фасованого насіння СН-1/СН-2 з органічними та зерновими господарствами України."
        }
    };

    const WL_THEMES = {
        iib: {
            title: "AgroCluster Analytics • ТОВ «Інститут інноваційної біоекономіки» & НААН",
            sub: "Цифрова екосистема провайдингу: Наукова Новація (За кадром) → Драфт ІІБ (Матриця Маржі) → Кластер → Вирізка Стартапу",
            accent: "#059669", dark: "#0f172a"
        },
        naan: {
            title: "Селекційний Хаб • ННЦ «Інститут землеробства НААН»",
            sub: "Платформа авторського нагляду, ліцензування ОІВ (Патент №180923) та замовлення Супереліти «Біла Принцеса»",
            accent: "#0284c7", dark: "#0c4a6e"
        },
        agrotech: {
            title: "Трансферно-технологічний комплекс «Агротехнополіс»",
            sub: "Цифрова екосистема кластерної контрактації у 50-км зоні, сидерації та глибокої біопереробки",
            accent: "#4f46e5", dark: "#1e1b4b"
        }
    };

    let currentProfile = LOCAL_AGRO_COMPANIES["00496802"];
    let calcState = {};
    let compareChart = null;
    let doughnutChart = null;

    function resolveGrantOperatorClient(prof) {
        if (prof.is_budget_institution) {
            return {
                operator_edrpou: "40125890",
                operator_name: "ТОВ «ІНСТИТУТ ІННОВАЦІЙНОЇ БІОЕКОНОМІКИ» (Провайдер кластеру)",
                badge_text: "ТОВ «ІНСТИТУТ ІННОВАЦІЙНОЇ БІОЕКОНОМІКИ» (ЄДРПОУ 40125890 — Провайдер) • НУС НААН виступає Ліцензіаром ОІВ",
                is_delegated: true,
                note: "Бюджетна наукова установа НААН не подається на комерційний грант напряму. Заявником виступає комерційний Провайдер ТОВ «ІІБ», а НУС НААН отримує замовлення на Супереліту та роялті."
            };
        }
        return {
            operator_edrpou: prof.edrpou,
            operator_name: prof.company_name,
            badge_text: `${prof.company_name} (ЄДРПОУ ${prof.edrpou} — Прямий комерційний заявник у консорціумі з ТОВ «ІІБ»)`,
            is_delegated: false,
            note: "Приватне аграрне/переробне підприємство відповідає критеріям прямого грантоодержувача у партнерстві з Провайдером ТОВ «ІІБ»."
        };
    }

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

        if (window.firestoreDb) {
            try {
                window.firestoreDb.collection("system_logs").add({
                    action: actionName,
                    details: detailsStr,
                    timestamp: new Date().toISOString()
                }).catch(() => {});
            } catch (err) {}
        }

        if (!BACKEND_URL) return;
        try {
            fetch(`${BACKEND_URL}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: actionName, details: detailsStr })
            }).catch(() => {});
        } catch (e) {}
    }

    document.getElementById('wlSelect').addEventListener('change', (e) => {
        const t = WL_THEMES[e.target.value] || WL_THEMES.iib;
        document.getElementById('brandTitle').textContent = t.title;
        document.getElementById('brandSub').textContent = t.sub;
        document.documentElement.style.setProperty('--accent-green', t.accent);
        document.documentElement.style.setProperty('--accent-dark', t.dark);
        logAction('WHITE_LABEL_SWITCH', `Обрано брендинг: ${e.target.value}`);
    });

    let currentCurrency = 'UAH';
    const EUR_RATE = 45.0;

    function fmtMln(val) {
        if (currentCurrency === 'EUR') {
            const eur = val / EUR_RATE;
            if (Math.abs(eur) >= 1000000) return (eur / 1000000).toFixed(2) + ' млн €';
            return Math.round(eur / 1000) + ' тис. €';
        }
        if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(2) + ' млн грн';
        return Math.round(val / 1000) + ' тис. грн';
    }

    const slArea = document.getElementById('slArea');
    const slYield = document.getElementById('slYield');
    const slProc = document.getElementById('slProc');
    const slPrepay = document.getElementById('slPrepay');

    const inpPriceOil = document.getElementById('inpPriceOil');
    const inpPricePowder = document.getElementById('inpPricePowder');
    const inpPriceMeal = document.getElementById('inpPriceMeal');
    const inpPriceSiderat = document.getElementById('inpPriceSiderat');
    const inpCostGrow = document.getElementById('inpCostGrow');
    const inpCostProcess = document.getElementById('inpCostProcess');
    const btnResetPrices = document.getElementById('btnResetPrices');

    function recalcClusterEconomics() {
        const area = parseFloat(slArea.value);
        const yld = parseFloat(slYield.value);
        const procPct = parseFloat(slProc.value) / 100.0;
        const sideratPct = +(1.0 - procPct).toFixed(2);
        const prepayPct = parseFloat(slPrepay.value) / 100.0;

        const priceOil = inpPriceOil ? parseFloat(inpPriceOil.value) || 90000 : 90000;
        const pricePowder = inpPricePowder ? parseFloat(inpPricePowder.value) || 25000 : 25000;
        const priceMeal = inpPriceMeal ? parseFloat(inpPriceMeal.value) || 10000 : 10000;
        const priceSiderat = inpPriceSiderat ? parseFloat(inpPriceSiderat.value) || 32000 : 32000;
        const costGrow = inpCostGrow ? parseFloat(inpCostGrow.value) || 14970 : 14970;
        const costProcess = inpCostProcess ? parseFloat(inpCostProcess.value) || 21500 : 21500;

        document.getElementById('valArea').textContent = area;
        document.getElementById('valYield').textContent = yld.toFixed(1);
        document.getElementById('valProc').textContent = Math.round(procPct * 100);
        document.getElementById('valSiderat').textContent = Math.round(sideratPct * 100);
        document.getElementById('valPrepay').textContent = Math.round(prepayPct * 100);

        const eliteHa = Math.max(10, Math.round(area / 15));
        const superEliteHa = Math.max(1.0, +(eliteHa / 100).toFixed(1));
        document.getElementById('seedChainHint').textContent =
            `Ланцюг Драфту: ${superEliteHa} га Супереліти НААН → ${eliteHa} га Базової Еліти (ДГ) → ${area} га СН-1 у 50-км зоні`;

        const totalHarvestTons = Math.round(area * yld);
        const tonsProcessed = Math.round(totalHarvestTons * procPct);
        const tonsSiderat = totalHarvestTons - tonsProcessed;

        const powderTons = +(tonsProcessed * 0.50).toFixed(1);
        const oilTons = +(tonsProcessed * 0.30).toFixed(1);
        const mealTons = +(tonsProcessed * 0.15).toFixed(1);
        const seedFractionTons = +(tonsProcessed * 0.05).toFixed(1);

        document.getElementById('dualExitHint').textContent =
            `Вихід Б (Переробка ${tonsProcessed} т): порошок ${powderTons} т, олія ${oilTons} т, шрот ${mealTons} т | Вихід А (Сидерат 25 кг): ${tonsSiderat} т`;

        // Капсула 1: Наукове ядро НУС НААН (Супереліта + Погектарне роялті 800 / 200 / 100 грн/га за «1_Драфт.pptx»)
        const naanSoloUah = 46000; // Слайд 11 «1_Драфт.pptx»: самостійний продаж без стартапу = 46 тис. грн
        const royaltyUah = Math.round((eliteHa * 800) + (area * 0.25 * 200) + (area * 100));
        const cost1 = Math.round(superEliteHa * 180000);
        const rev1 = Math.round((superEliteHa * 350000) + royaltyUah + (eliteHa * 8500));
        const mar1 = rev1 - cost1;
        const prepaySum = Math.round(rev1 * prepayPct);
        const naanMult = Math.max(4.6, +(mar1 / naanSoloUah).toFixed(1));

        // Капсула 2: Базове насінництво Еліти (ДГ / БГ — слайд 6 «1_Драфт.pptx»)
        const cost2 = Math.round(eliteHa * 18600);
        const rev2 = Math.round(eliteHa * 52800);
        const mar2 = rev2 - cost2;

        // Капсула 3: Фермерський пул СН-1 (Товарне зерно + Сидерат у мішках 25 кг — слайди 8–9 «1_Драфт.pptx»)
        const cost3 = Math.round(area * costGrow);
        const rev3 = Math.round((tonsSiderat * priceSiderat) + (tonsProcessed * 20000));
        const mar3 = rev3 - cost3;

        // Капсула 4: Завод глибокої переробки Zero-Waste (слайд 10 «1_Драфт.pptx»)
        const revOil = Math.round(oilTons * priceOil);
        const revPowder = Math.round(powderTons * pricePowder);
        const revMeal = Math.round(mealTons * priceMeal);
        const revSeedFraction = Math.round(seedFractionTons * 40000);

        const cost4 = Math.round(tonsProcessed * costProcess);
        const rev4 = revOil + revPowder + revMeal + revSeedFraction;
        const mar4 = rev4 - cost4;

        const totalCost = cost1 + cost2 + cost3 + cost4;
        const totalRev = rev1 + rev2 + rev3 + rev4;
        const totalMargin = mar1 + mar2 + mar3 + mar4;
        const rawOnlyMargin = Math.round(naanSoloUah + Math.max(500000, (totalHarvestTons * 18000) - cost3));
        const roi = Math.round((totalMargin / Math.max(1, totalCost)) * 100);
        const effectE2 = Math.round(totalMargin * 0.15);

        // Точка входу інвестицій (Вузьке місце для запуску базового посіву Еліти + контрактації ІІБ)
        const investmentEntryUah = Math.round(cost1 + cost2 + 240000);
        const investmentEntryEur = Math.round(investmentEntryUah / 45);

        calcState = {
            area, yld,
            procPct: Math.round(procPct * 100),
            sideratPct: Math.round(sideratPct * 100),
            prepayPct: Math.round(prepayPct * 100),
            superEliteHa, eliteHa, totalHarvestTons,
            tonsProcessed, tonsSiderat, powderTons, oilTons, mealTons, seedFractionTons,
            priceOil, pricePowder, priceMeal, priceSiderat, costGrow, costProcess,
            revOil, revPowder, revMeal, revSeedFraction,
            cost1, rev1, mar1, royaltyUah, naanSoloUah, naanMult, prepaySum,
            cost2, rev2, mar2,
            cost3, rev3, mar3,
            cost4, rev4, mar4,
            totalCost, totalRev, totalMargin, rawOnlyMargin, roi, effectE2,
            investmentEntryUah, investmentEntryEur
        };

        document.getElementById('kpiHarvest').textContent = `${totalHarvestTons} т`;
        document.getElementById('kpiHarvestSplit').textContent = `Переробка: ${tonsProcessed} т | Сидерат: ${tonsSiderat} т`;
        document.getElementById('kpiMargin').textContent = fmtMln(totalMargin);
        document.getElementById('kpiEffectSub').textContent = `Ефект ІІБ (E₂): +${fmtMln(effectE2)}`;
        document.getElementById('kpiNaanBenefit').textContent = '+' + fmtMln(mar1);
        document.getElementById('kpiNaanMult').textContent = `×${naanMult} проти 46 тис. грн без ІІБ`;
        document.getElementById('kpiEntryPoint').textContent = fmtMln(investmentEntryUah);
        document.getElementById('kpiEntryEur').textContent = currentCurrency === 'EUR'
            ? `В еквіваленті ~${(investmentEntryUah / 1000000).toFixed(2)} млн грн`
            : `Старт Еліти (~${investmentEntryEur} тис. €)`;
        document.getElementById('calcSummaryBadge').textContent = `Рентабельність циклу (ROI): ${roi}%`;

        // Окупність лінії глибокої переробки (CAPEX 8 000 000 грн)
        const lineCapexUah = 8000000;
        const paybackSeasons = mar4 > 0 ? (lineCapexUah / mar4).toFixed(1) : '> 5';
        const paybackMonths = mar4 > 0 ? Math.max(1, Math.round((lineCapexUah / mar4) * 12)) : 60;
        const kpiPayback = document.getElementById('kpiPayback');
        const kpiPaybackSub = document.getElementById('kpiPaybackSub');
        if (kpiPayback && kpiPaybackSub) {
            kpiPayback.textContent = `${paybackSeasons} сезону`;
            kpiPaybackSub.textContent = `CAPEX ${fmtMln(lineCapexUah)} (~${paybackMonths} міс.)`;
        }

        document.getElementById('p_margin_live').textContent = `${fmtMln(totalMargin)} (ROI ${roi}%)`;
        document.getElementById('p_size').textContent = `${area} га (${totalHarvestTons} т: ${tonsProcessed} т переробка / ${tonsSiderat} т сидерат)`;

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
        renderRevenueStructureChart(revOil, revPowder, revMeal, revSeedFraction);
    }

    function renderComparisonChart(rawMargin, clusterMargin) {
        const ctx = document.getElementById('marginCompareChart');
        if (!ctx) return;
        const factor = currentCurrency === 'EUR' ? (1000000 * EUR_RATE) : 1000000;
        const rawMln = +(rawMargin / factor).toFixed(2);
        const clMln = +(clusterMargin / factor).toFixed(2);
        const curLabel = currentCurrency === 'EUR' ? 'млн €' : 'млн грн';

        if (compareChart) {
            compareChart.data.datasets[0].data = [rawMln, clMln];
            compareChart.data.datasets[0].label = `Чиста маржа (${curLabel})`;
            compareChart.options.plugins.title.text = `Чиста маржа проєкту (${curLabel})`;
            compareChart.options.scales.y.title.text = curLabel;
            compareChart.update();
            return;
        }

        compareChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Без Драфту ІІБ (Сировина)', 'Кластер ІІБ (Zero-Waste)'],
                datasets: [{
                    label: `Чиста маржа (${curLabel})`,
                    data: [rawMln, clMln],
                    backgroundColor: ['#94a3b8', '#059669'],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: `Чиста маржа проєкту (${curLabel})`, font: { size: 11, weight: 'bold' } }
                },
                scales: { y: { beginAtZero: true, title: { display: true, text: curLabel } } }
            }
        });
    }

    function renderRevenueStructureChart(oilRev, powderRev, mealRev, seedRev) {
        const ctx = document.getElementById('revenueStructureChart');
        if (!ctx) return;
        const oilMln = +(oilRev / 1000000).toFixed(2);
        const powderMln = +(powderRev / 1000000).toFixed(2);
        const mealMln = +(mealRev / 1000000).toFixed(2);
        const seedMln = +(seedRev / 1000000).toFixed(2);

        if (doughnutChart) {
            doughnutChart.data.datasets[0].data = [oilMln, powderMln, mealMln, seedMln];
            doughnutChart.update();
            return;
        }

        doughnutChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Олія (30%)', 'Порошок (50%)', 'Шрот (15%)', 'Фракція (5%)'],
                datasets: [{
                    data: [oilMln, powderMln, mealMln, seedMln],
                    backgroundColor: ['#059669', '#d97706', '#2563eb', '#94a3b8'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { boxWidth: 10, font: { size: 10 } }
                    },
                    title: {
                        display: true,
                        text: 'Виручка переробки (млн грн)',
                        font: { size: 11, weight: 'bold' }
                    }
                }
            }
        });
    }

    [slArea, slYield, slProc, slPrepay].forEach(el => {
        if (!el) return;
        el.addEventListener('input', recalcClusterEconomics);
        el.addEventListener('change', () => {
            logAction('DRAFT_MATRIX_SIMULATION', `Площа: ${calcState.area} га, Переробка: ${calcState.procPct}%, Сидерат: ${calcState.sideratPct}%, Маржа: ${fmtMln(calcState.totalMargin)}`);
        });
    });

    function saveCustomPricesToStorage() {
        try {
            const p = {
                priceOil: inpPriceOil ? inpPriceOil.value : "90000",
                pricePowder: inpPricePowder ? inpPricePowder.value : "25000",
                priceMeal: inpPriceMeal ? inpPriceMeal.value : "10000",
                priceSiderat: inpPriceSiderat ? inpPriceSiderat.value : "32000",
                costGrow: inpCostGrow ? inpCostGrow.value : "14970",
                costProcess: inpCostProcess ? inpCostProcess.value : "21500"
            };
            localStorage.setItem('agrocluster_custom_prices', JSON.stringify(p));
        } catch (e) {}
    }

    function loadCustomPricesFromStorage() {
        try {
            const raw = localStorage.getItem('agrocluster_custom_prices');
            if (raw) {
                const p = JSON.parse(raw);
                if (inpPriceOil && p.priceOil) inpPriceOil.value = p.priceOil;
                if (inpPricePowder && p.pricePowder) inpPricePowder.value = p.pricePowder;
                if (inpPriceMeal && p.priceMeal) inpPriceMeal.value = p.priceMeal;
                if (inpPriceSiderat && p.priceSiderat) inpPriceSiderat.value = p.priceSiderat;
                if (inpCostGrow && p.costGrow) inpCostGrow.value = p.costGrow;
                if (inpCostProcess && p.costProcess) inpCostProcess.value = p.costProcess;
            }
        } catch (e) {}
    }

    [inpPriceOil, inpPricePowder, inpPriceMeal, inpPriceSiderat, inpCostGrow, inpCostProcess].forEach(el => {
        if (!el) return;
        el.addEventListener('input', () => {
            recalcClusterEconomics();
            saveCustomPricesToStorage();
        });
    });

    if (btnResetPrices) {
        btnResetPrices.addEventListener('click', () => {
            if (inpPriceOil) inpPriceOil.value = 90000;
            if (inpPricePowder) inpPricePowder.value = 25000;
            if (inpPriceMeal) inpPriceMeal.value = 10000;
            if (inpPriceSiderat) inpPriceSiderat.value = 32000;
            if (inpCostGrow) inpCostGrow.value = 14970;
            if (inpCostProcess) inpCostProcess.value = 21500;
            try { localStorage.removeItem('agrocluster_custom_prices'); } catch (e) {}
            recalcClusterEconomics();
            logAction('PRICING_RESET', 'Скинуто параметри ринку та собівартості до дефолтів 2026');
        });
    }

    loadCustomPricesFromStorage();
    recalcClusterEconomics();

    function updateProfileUI(prof) {
        currentProfile = prof;
        const op = resolveGrantOperatorClient(prof);
        document.getElementById('p_edrpou').textContent = prof.edrpou;
        document.getElementById('p_company').textContent = prof.company_name;
        document.getElementById('p_kved').textContent = prof.kved;
        document.getElementById('p_region').textContent = prof.region;
        document.getElementById('p_activity').textContent = prof.activity_type;
        document.getElementById('p_own').textContent = prof.own_contribution_percent;
        document.getElementById('p_focus').textContent = prof.investment_focus;
        document.getElementById('p_operator').textContent = op.badge_text;

        const st = document.getElementById('verifyStatus');
        st.textContent = "Агро-КВЕД підтверджено в Реєстрі ІІБ";
        st.style.color = "#059669";
    }

    const btnCurUah = document.getElementById('btnCurUah');
    const btnCurEur = document.getElementById('btnCurEur');
    if (btnCurUah && btnCurEur) {
        btnCurUah.addEventListener('click', () => {
            currentCurrency = 'UAH';
            btnCurUah.classList.add('active');
            btnCurEur.classList.remove('active');
            recalcClusterEconomics();
            logAction('CURRENCY_SWITCH', 'Обрано валюту розрахунку: UAH (Гривня)');
        });
        btnCurEur.addEventListener('click', () => {
            currentCurrency = 'EUR';
            btnCurEur.classList.add('active');
            btnCurUah.classList.remove('active');
            recalcClusterEconomics();
            logAction('CURRENCY_SWITCH', 'Обрано валюту розрахунку: EUR (Євро, курс 45.0)');
        });
    }

    // Перевірка переходу з адмін-панелі за query-параметром (?edrpou=...)
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const queryEdr = urlParams.get('edrpou');
        if (queryEdr && LOCAL_AGRO_COMPANIES[queryEdr]) {
            currentProfile = LOCAL_AGRO_COMPANIES[queryEdr];
        }
    } catch (e) {}

    updateProfileUI(currentProfile);

    const chatbox = document.getElementById('chatbox');
    function addChatMsg(sender, htmlText, isError = false) {
        const div = document.createElement('div');
        div.className = 'msg ' + (sender === 'Ви' ? 'user' : ('bot' + (isError ? ' error-msg' : '')));
        div.innerHTML = `<strong>${sender}:</strong><br>${htmlText}`;
        chatbox.appendChild(div);
        chatbox.scrollTop = chatbox.scrollHeight;
    }

    async function handleUserQuery(text) {
        const clean = text.trim();
        if (!clean) return;
        addChatMsg('Ви', clean);

        const match = clean.match(/\b(\d{8})\b/);
        const code = match ? match[1] : null;

        // 1. Перевірка неаграрних підприємств (Жорсткий фільтр «Тільки Аграрії»)
        if (code && NON_AGRO_REJECT_LIST[code]) {
            const bad = NON_AGRO_REJECT_LIST[code];
            const st = document.getElementById('verifyStatus');
            st.textContent = `ВІДХИЛЕНО: Неаграрний КВЕД (${bad.kved.split(' ')[0]})`;
            st.style.color = "#dc2626";
            logAction('EDRPOU_REJECTED_NON_AGRO', `Відхилено неаграрний ЄДРПОУ ${code}: ${bad.company_name}`);
            addChatMsg(
                'Агро-Фільтр ЄДРПОУ (Відмова)',
                `❌ <strong>ВІДХИЛЕНО СЕКТОРАЛЬНИМ ФІЛЬТРОМ:</strong> Юридична особа <strong>${bad.company_name}</strong> (ЄДРПОУ ${code}, КВЕД <code>${bad.kved}</code>) не може бути включена до аграрного кластеру.<br>` +
                `• <strong>Причина:</strong> ${bad.reason}`,
                true
            );
            return;
        }

        // 2. Перевірка у локальному каталозі верифікованих аграріїв
        if (code && LOCAL_AGRO_COMPANIES[code]) {
            const comp = LOCAL_AGRO_COMPANIES[code];
            updateProfileUI(comp);
            const op = resolveGrantOperatorClient(comp);
            logAction('EDRPOU_AGRO_VERIFIED', `ЄДРПОУ ${code}: ${comp.company_name}`);
            addChatMsg(
                'Координатор Драфту ІІБ',
                `✅ <strong>Верифіковано аграрного суб'єкта:</strong> ${comp.company_name} (ЄДРПОУ ${comp.edrpou}).<br>` +
                `• <strong>Галузевий КВЕД:</strong> ${comp.kved}<br>` +
                `• <strong>Капсула у Драфті ІІБ:</strong> ${comp.activity_type}<br>` +
                `• <strong>Оператор подачі на грант/інвестиції:</strong> ${op.operator_name}<br>` +
                `• <strong>Чиста маржа кластеру (${calcState.area} га):</strong> ${fmtMln(calcState.totalMargin)} (Точка входу: ${fmtMln(calcState.investmentEntryUah)}).`
            );
            return;
        }

        // 3. Якщо є 8-значний код, звертаємося до серверного парсера /api/edrpou/{code} або валідуємо КВЕД
        if (code) {
            if (BACKEND_URL) {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/edrpou/${code}?context=${encodeURIComponent(clean)}`);
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                        const st = document.getElementById('verifyStatus');
                        st.textContent = "ВІДХИЛЕНО: Неаграрний профіль";
                        st.style.color = "#dc2626";
                        addChatMsg('Агро-Фільтр ЄДРПОУ (Відмова)', `❌ ${data.message || 'Підприємство не пройшло перевірку аграрного КВЕДу.'}`, true);
                        return;
                    }
                    updateProfileUI(data);
                    const op = resolveGrantOperatorClient(data);
                    addChatMsg(
                        'Координатор Драфту ІІБ',
                        `✅ <strong>Парсер ЄДР підтвердив агропрофіль:</strong> ${data.company_name} (ЄДРПОУ ${data.edrpou}).<br>` +
                        `• <strong>КВЕД:</strong> ${data.kved}<br>` +
                        `• <strong>Капсула в кластері:</strong> ${data.activity_type}<br>` +
                        `• <strong>Оператор подачі:</strong> ${op.operator_name}`
                    );
                    return;
                } catch (e) {}
            }

            // Клієнтський парсер-класифікатор аграрних КВЕДів
            const badKw = ["62.01", "64.19", "47.52", "41.20", "програмування", "будівництво", "банк"];
            if (badKw.some(w => clean.toLowerCase().includes(w))) {
                addChatMsg('Агро-Фільтр ЄДРПОУ (Відмова)', `❌ Код ЄДРПОУ ${code} відхилено: виявлено неаграрний КВЕД. Допускаються лише КВЕД 01.xx, 10.41, 10.84, 10.91 та 72.19.`, true);
                return;
            }

            const kvedMatch = clean.match(/\b(01\.\d{2}|10\.\d{2}|46\.21|72\.19)\b/);
            const kvedCode = kvedMatch ? kvedMatch[1] : "01.11";
            const customComp = {
                edrpou: code,
                company_name: `АГРОПІДПРИЄМСТВО КЛАСТЕРУ (ЄДРПОУ ${code})`,
                kved: `${kvedCode} Вирощування та переробка олійних і сидеральних культур`,
                region: "Україна (50-км кластерна зона)",
                activity_type: kvedCode.startsWith("10.")
                    ? "Капсула ІІІ (Вихід Б) • Завод глибокої переробки"
                    : "Капсула ІІ • Фермерський пул СН-1 та Сидерація (у радіусі 50 км)",
                own_contribution_percent: "30% (Виробничі потужності)",
                investment_focus: clean,
                is_budget_institution: false
            };
            updateProfileUI(customComp);
            logAction('EDRPOU_CUSTOM_AGRO', `Новий аграрний учасник ЄДРПОУ ${code} (КВЕД ${kvedCode})`);
            addChatMsg(
                'Координатор Драфту ІІБ',
                `✅ <strong>Верифіковано нового агропартнера (ЄДРПОУ ${code}, КВЕД ${kvedCode}):</strong> включено до 50-км зони кластеру «Біла Принцеса».`
            );
            return;
        }

        logAction('CHAT_QUERY', clean);
        addChatMsg(
            'Координатор Драфту ІІБ',
            `Параметри враховано у матриці Драфту ІІБ (${calcState.area} га). Сукупна чиста маржа: <strong>${fmtMln(calcState.totalMargin)}</strong> (Подвійний вихід: ${calcState.tonsProcessed} т на переробку та ${calcState.tonsSiderat} т на сидерат у мішках 25 кг).`
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

        await new Promise(resolve => setTimeout(resolve, 120));

        try {
            if (typeof html2pdf !== 'undefined') {
                await html2pdf().set({
                    margin: [10, 10, 10, 10],
                    filename: fileName,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0, scrollX: 0 },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                }).from(target).save();
            }
        } finally {
            wrapper.style.display = 'none';
            target.innerHTML = '';
            window.scrollTo(0, prevScrollY);
        }
    }

    // 1. Генерація Ескізного Драфту ІІБ (PDF)
    document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
        const btn = document.getElementById('downloadPdfBtn');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Формую Драфт ІІБ...';
        const op = resolveGrantOperatorClient(currentProfile);
        logAction('PDF_DRAFT_GENERATED', `ЄДРПОУ: ${currentProfile.edrpou}, Площа: ${calcState.area} га, Маржа: ${fmtMln(calcState.totalMargin)}`);

        try {
            const nowStr = new Date().toLocaleDateString('uk-UA');
            const draftHtml = `
                <div style="border-bottom: 3px solid #059669; padding-bottom: 10px; margin-bottom: 12px;">
                    <div style="font-size: 10px; color: #059669; font-weight: bold; text-transform: uppercase;">НАДБУДОВА ТОВ «ІНСТИТУТ ІННОВАЦІЙНОЇ БІОЕКОНОМІКИ» (ІІБ) • ННЦ «ІЗ НААН»</div>
                    <h2 style="margin: 4px 0 0 0; font-size: 16.5px; color: #0f172a;">ЕСКІЗНИЙ ПРОЄКТ (ДРАФТ) ІННОВАЦІЙНОГО АГРОКЛАСТЕРУ «БІЛА ПРИНЦЕСА»</h2>
                    <p style="margin: 4px 0 0 0; color: #475569; font-size: 11px;">Дата: ${nowStr} | ОІВ: Патент №180923, Свідоцтво №180501 | Архітектура: Наукова Новація → Драфт ІІБ → Договірний Кластер</p>
                </div>

                <h3 style="font-size: 13px; color: #059669; margin: 10px 0 5px 0;">1. Паспорт учасника та Комерційний Оператор провайдингу</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px;">
                    <tr><td style="border: 1px solid #cbd5e1; padding: 5px; font-weight: bold; width: 36%; background: #f8fafc;">Суб'єкт кластеру (ЄДРПОУ)</td><td style="border: 1px solid #cbd5e1; padding: 5px;">${currentProfile.company_name} (ЄДРПОУ ${currentProfile.edrpou})</td></tr>
                    <tr><td style="border: 1px solid #cbd5e1; padding: 5px; font-weight: bold; background: #f8fafc;">Агро-КВЕД та Регіон</td><td style="border: 1px solid #cbd5e1; padding: 5px;">${currentProfile.kved} | ${currentProfile.region}</td></tr>
                    <tr><td style="border: 1px solid #cbd5e1; padding: 5px; font-weight: bold; background: #f8fafc;">Капсула у Драфті ІІБ</td><td style="border: 1px solid #cbd5e1; padding: 5px;">${currentProfile.activity_type}</td></tr>
                    <tr><td style="border: 1px solid #cbd5e1; padding: 5px; font-weight: bold; background: #eff6ff;">Офіційний Заявник / Оператор Гранту</td><td style="border: 1px solid #cbd5e1; padding: 5px; font-weight: bold; color: #1d4ed8;">${op.badge_text}</td></tr>
                </table>

                <h3 style="font-size: 13px; color: #059669; margin: 10px 0 5px 0;">2. Матриця Драфту ІІБ (${calcState.area} га СН-1 | Подвійний вихід: Переробка ${calcState.procPct}% / Сидерат ${calcState.sideratPct}%)</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px;">
                    <tr style="background: #f1f5f9;">
                        <th style="border: 1px solid #cbd5e1; padding: 5px; text-align: left;">Капсула ланцюга вартості</th>
                        <th style="border: 1px solid #cbd5e1; padding: 5px; text-align: left;">Обсяг у Драфті</th>
                        <th style="border: 1px solid #cbd5e1; padding: 5px; text-align: left;">Витрати</th>
                        <th style="border: 1px solid #cbd5e1; padding: 5px; text-align: left;">Виручка</th>
                        <th style="border: 1px solid #cbd5e1; padding: 5px; text-align: left;">Чиста маржа</th>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;"><strong>За кадром: Наукове ядро (НУС НААН)</strong></td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${calcState.superEliteHa} га Супереліти + Роялті 800/200/100</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${fmtMln(calcState.cost1)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${fmtMln(calcState.rev1)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px; font-weight: bold; color: #059669;">+${fmtMln(calcState.mar1)} (×${calcState.naanMult})</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;"><strong>Капсула І: Базова Еліта (ДГ / БГ)</strong></td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${calcState.eliteHa} га розмноження Еліти</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${fmtMln(calcState.cost2)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${fmtMln(calcState.rev2)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px; font-weight: bold; color: #059669;">+${fmtMln(calcState.mar2)}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;"><strong>Капсула ІІ: Фермери 50-км зони (СН-1 + Сидерат)</strong></td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${calcState.area} га (${calcState.tonsSiderat} т сидерат 25 кг)</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${fmtMln(calcState.cost3)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${fmtMln(calcState.rev3)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px; font-weight: bold; color: #059669;">+${fmtMln(calcState.mar3)}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;"><strong>Капсула ІІІ: Глибока переробка Zero-Waste</strong></td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${calcState.tonsProcessed} т (олія ${calcState.oilTons} т, порошок ${calcState.powderTons} т, шрот ${calcState.mealTons} т)</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${fmtMln(calcState.cost4)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${fmtMln(calcState.rev4)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px; font-weight: bold; color: #059669;">+${fmtMln(calcState.mar4)}</td>
                    </tr>
                </table>

                <h3 style="font-size: 13px; color: #059669; margin: 10px 0 5px 0;">3. Точка інвестиційного входу та Мова вигоди учасників</h3>
                <div style="background: #ecfdf5; border: 1px solid #6ee7b7; padding: 10px; border-radius: 6px; font-size: 11.5px; line-height: 1.55;">
                    • <strong>Сукупна чиста маржа кластеру:</strong> ${fmtMln(calcState.totalMargin)} (ROI: <strong>${calcState.roi}%</strong>)<br>
                    • <strong>Баланс виручки глибокої переробки:</strong> Олія 30% (${fmtMln(calcState.revOil)}), Порошок 50% (${fmtMln(calcState.revPowder)}), Шрот 15% (${fmtMln(calcState.revMeal)}), Фракція (${fmtMln(calcState.revSeedFraction)})<br>
                    • <strong>Точка входу інвестицій (потреба у стартовому капіталі на вузьке місце):</strong> ${fmtMln(calcState.investmentEntryUah)} (~${calcState.investmentEntryEur} тис. €)<br>
                    • <strong>Вигода НУС НААН:</strong> зростання доходу у <strong>${calcState.naanMult} раза</strong> порівняно із самостійним продажем насіння без стартапу (46 тис. грн)<br>
                    • <strong>Подвійне замикання:</strong> ${calcState.tonsSiderat} т фасованого сидерату (відновлення азоту, захист від нематод) + ${calcState.tonsProcessed} т на глибоку переробку в 50-км зоні (експорт Німеччина, Нідерланди).
                </div>
            `;
            await exportHtmlToPdf(draftHtml, 'AgroCluster_IIB_Draft_Project.pdf');
        } finally {
            btn.disabled = false;
            btn.textContent = orig;
        }
    });

    // 2. Генерація Вирізки Стартапу / Інвестиційного Тизера (PDF)
    document.getElementById('downloadTeaserBtn').addEventListener('click', async () => {
        const btn = document.getElementById('downloadTeaserBtn');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Формую Тизер...';

        const lotKey = document.getElementById('startupLotSelect').value;
        const selectedLot = STARTUP_LOTS[lotKey] || STARTUP_LOTS.lot_100k_eur;
        const op = resolveGrantOperatorClient(currentProfile);
        logAction('PDF_STARTUP_LOT_GENERATED', `Лот: ${selectedLot.code}, Заявник: ${op.operator_edrpou}, ROI: ${calcState.roi}%`);

        try {
            const nowStr = new Date().toLocaleDateString('uk-UA');
            const teaserHtml = `
                <div style="background: #0f172a; color: #ffffff; padding: 16px 20px; border-radius: 8px; border-bottom: 4px solid #059669; margin-bottom: 14px;">
                    <div style="font-size: 10px; color: #34d399; text-transform: uppercase; letter-spacing: 0.8px; font-weight: bold;">ВИРІЗКА СТАРТАП-ЛОТУ ІЗ ДРАФТУ ІІБ • INVESTMENT TEASER & PITCH DECK</div>
                    <h1 style="margin: 5px 0 4px 0; font-size: 17.5px;">${selectedLot.title}</h1>
                    <div style="font-size: 11px; color: #cbd5e1;">Кейс: сорт гірчиці білої «Біла Принцеса» (Патент №180923) • Цільовий інститут: ${selectedLot.donor}</div>
                </div>

                <div style="display: flex; gap: 10px; margin-bottom: 14px;">
                    <div style="flex: 1; background: #ecfdf5; border: 1px solid #6ee7b7; padding: 10px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 9.5px; color: #047857; text-transform: uppercase; font-weight: bold;">Обсяг фінансування лоту</div>
                        <div style="font-size: 15px; font-weight: bold; color: #059669; margin-top: 4px;">${selectedLot.amount}</div>
                    </div>
                    <div style="flex: 1; background: #eff6ff; border: 1px solid #93c5fd; padding: 10px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 9.5px; color: #1d4ed8; text-transform: uppercase; font-weight: bold;">Чиста маржа кластеру</div>
                        <div style="font-size: 15px; font-weight: bold; color: #2563eb; margin-top: 4px;">${fmtMln(calcState.totalMargin)} (ROI ${calcState.roi}%)</div>
                    </div>
                    <div style="flex: 1; background: #fef3c7; border: 1px solid #fcd34d; padding: 10px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 9.5px; color: #b45309; text-transform: uppercase; font-weight: bold;">Роялті та Опція НААН</div>
                        <div style="font-size: 15px; font-weight: bold; color: #d97706; margin-top: 4px;">+${fmtMln(calcState.mar1)} (×${calcState.naanMult})</div>
                    </div>
                </div>

                <h3 style="font-size: 12.5px; color: #0f172a; border-left: 4px solid #059669; padding-left: 8px; margin: 10px 0 5px 0;">1. Предмет вирізки Стартапу із загального Драфту кластеру</h3>
                <p style="font-size: 11px; line-height: 1.5; color: #334155; margin: 0 0 10px 0;">
                    ${selectedLot.sliceDesc}
                </p>

                <h3 style="font-size: 12.5px; color: #0f172a; border-left: 4px solid #2563eb; padding-left: 8px; margin: 10px 0 5px 0;">2. Офіційний Заявник (Правило провайдингу ТОВ «ІІБ»)</h3>
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; border-radius: 6px; font-size: 11px; line-height: 1.45; margin-bottom: 10px;">
                    • <strong>Комерційний Заявник (Оператор лоту):</strong> ${op.operator_name} (ЄДРПОУ ${op.operator_edrpou})<br>
                    • <strong>Базовий учасник профілю:</strong> ${currentProfile.company_name} (ЄДРПОУ ${currentProfile.edrpou}, ${currentProfile.kved})<br>
                    • <strong>Юридичне обґрунтування ІІБ:</strong> ${op.note}
                </div>

                <h3 style="font-size: 12.5px; color: #0f172a; border-left: 4px solid #059669; padding-left: 8px; margin: 10px 0 5px 0;">3. Договірна обв'язка кластеру та подвійний вихід продукції</h3>
                <ul style="font-size: 11px; line-height: 1.55; color: #334155; margin: 0 0 12px 0;">
                    <li><strong>Договірна структура:</strong> ${selectedLot.contractChain}</li>
                    <li><strong>Вихід А (Сидерат та біофумігація):</strong> ${calcState.tonsSiderat} т фасованого насіння у мішках 25 кг (42 000 грн/т) для фермерів.</li>
                    <li><strong>Вихід Б (Глибока переробка у 50-км зоні):</strong> ${calcState.tonsProcessed} т (порошок ${calcState.powderTons} т, олія ${calcState.oilTons} т, кормовий шрот ${calcState.mealTons} т; експорт у Німеччину та Нідерланди).</li>
                </ul>

                <div style="border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 10.5px; color: #475569; display: flex; justify-content: space-between;">
                    <span>Архітектор Драфту: ТОВ «Інститут інноваційної біоекономіки» (ЄДРПОУ 40125890)</span>
                    <span>Дата формування: ${nowStr}</span>
                </div>
            `;
            await exportHtmlToPdf(teaserHtml, `AgroCluster_Startup_Teaser_${selectedLot.code}.pdf`);
        } finally {
            btn.disabled = false;
            btn.textContent = orig;
        }
    });

    // 3. Генерація Кластерної Угоди та Плану (DOCX з миттєвим клієнтським резервом)
    document.getElementById('downloadDocxBtn').addEventListener('click', async () => {
        const btn = document.getElementById('downloadDocxBtn');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Формую DOCX...';
        logAction('DOCX_EXPORT_REQUEST', `ЄДРПОУ: ${currentProfile.edrpou}, Площа: ${calcState.area} га`);

        const params = new URLSearchParams({
            edrpou: currentProfile.edrpou,
            company: currentProfile.company_name,
            kved: currentProfile.kved,
            area: calcState.area,
            margin: fmtMln(calcState.totalMargin),
            roi: calcState.roi,
            prepay: fmtMln(calcState.mar1)
        });

        try {
            if (BACKEND_URL) {
                const res = await fetch(`${BACKEND_URL}/export/00000000-0000-0000-0000-000000000000?${params.toString()}`);
                if (res.ok) {
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `AgroCluster_IIB_Draft_Agreement_${currentProfile.edrpou}.docx`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    return;
                }
            }

            // Миттєва клієнтська генерація Word-документа (0.1 сек, без затримок сервера)
            const op = resolveGrantOperatorClient(currentProfile);
            const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head><meta charset='utf-8'><title>Ескізний Проєкт (Драфт ІІБ) та Кластерна Угода</title></head>
            <body style="font-family: Arial, sans-serif; font-size: 11pt;">
                <h1>ЕСКІЗНИЙ ПРОЄКТ (ДРАФТ) ТА РАМКОВА УГОДА ІННОВАЦІЙНОГО АГРОКЛАСТЕРУ</h1>
                <p><strong>Провайдер (Надбудова):</strong> ТОВ «Інститут інноваційної біоекономіки» (ЄДРПОУ 40125890)<br>
                <strong>Наукове ядро:</strong> ННЦ «Інститут землеробства НААН» (ЄДРПОУ 00496802, Патент №180923 «Біла Принцеса»)</p>
                <h2>1. Паспорт учасника та Комерційний Заявник</h2>
                <p><strong>Учасник:</strong> ${currentProfile.company_name} (ЄДРПОУ ${currentProfile.edrpou})<br>
                <strong>Агро-КВЕД:</strong> ${currentProfile.kved}<br>
                <strong>Капсула у Драфті:</strong> ${currentProfile.activity_type}<br>
                <strong>Офіційний Оператор подачі на грант/інвестиції:</strong> ${op.badge_text}</p>
                <h2>2. Показники матриці Драфту (${calcState.area} га у 50-км зоні)</h2>
                <ul>
                    <li>Ланцюг: ${calcState.superEliteHa} га Супереліти НААН → ${calcState.eliteHa} га Базової Еліти → ${calcState.area} га СН-1</li>
                    <li>Валовий збір: ${calcState.totalHarvestTons} т (Переробка: ${calcState.tonsProcessed} т | Сидерат у мішках 25 кг: ${calcState.tonsSiderat} т)</li>
                    <li>Сукупна чиста маржа кластеру: ${fmtMln(calcState.totalMargin)} (ROI ${calcState.roi}%)</li>
                    <li>Дохід НУС НААН (Роялті + Опція): +${fmtMln(calcState.mar1)} (×${calcState.naanMult} проти 46 тис. грн самостійного продажу)</li>
                    <li>Точка входу інвестицій (старт базового посіву): ${fmtMln(calcState.investmentEntryUah)} (~${calcState.investmentEntryEur} тис. €)</li>
                </ul>
            </body></html>`;
            const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `AgroCluster_IIB_Draft_Agreement_${currentProfile.edrpou}.doc`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } finally {
            btn.disabled = false;
            btn.textContent = orig;
        }
    });

    // 4. Експорт Фінансово-Економічної Матриці (CSV/Excel з підтримкою кирилиці UTF-8 BOM)
    const btnDownloadCsv = document.getElementById('downloadCsvBtn');
    if (btnDownloadCsv) {
        btnDownloadCsv.addEventListener('click', () => {
            const rows = [
                ["Параметр фінансової моделі", "Розрахункове значення", "Одиниця виміру / Додатковий коментар"],
                ["Дата розрахунку", new Date().toLocaleDateString('uk-UA'), ""],
                ["Суб'єкт кластеру", currentProfile.company_name, `ЄДРПОУ: ${currentProfile.edrpou}`],
                ["Галузевий КВЕД", currentProfile.kved, ""],
                ["Капсула у Драфті ІІБ", currentProfile.activity_type, ""],
                ["", "", ""],
                ["--- МАСШТАБ КЛАСТЕРНОГО ЦИКЛУ ---", "", ""],
                ["Площа посівів СН-1 у 50-км зоні", calcState.area, "га"],
                ["Врожайність сорту «Біла Принцеса»", calcState.yld, "т/га"],
                ["Валовий збір насіння", calcState.totalHarvestTons, "т"],
                ["Частка глибокої переробки (Вихід Б)", calcState.procPct, "%"],
                ["Частка фасованого сидерату (Вихід А)", calcState.sideratPct, "%"],
                ["Обсяг насіння на переробку", calcState.tonsProcessed, "т"],
                ["Обсяг насіння на сидерат (мішки 25 кг)", calcState.tonsSiderat, "т"],
                ["", "", ""],
                ["--- БАЛАНС ГЛИБОКОЇ ПЕРЕРОБКИ ZERO-WASTE ---", "", ""],
                ["Олія холодного віджиму (30%)", calcState.oilTons, `т | Ціна: ${calcState.priceOil} грн/т | Виручка: ${calcState.revOil} грн`],
                ["Гірчичний порошок (50%)", calcState.powderTons, `т | Ціна: ${calcState.pricePowder} грн/т | Виручка: ${calcState.revPowder} грн`],
                ["Кормовий білковий шрот (15%)", calcState.mealTons, `т | Ціна: ${calcState.priceMeal} грн/т | Виручка: ${calcState.revMeal} грн`],
                ["Технічна насіннєва фракція (5%)", calcState.seedFractionTons, `т | Ціна: 40000 грн/т | Виручка: ${calcState.revSeedFraction} грн`],
                ["", "", ""],
                ["--- ВИТРАТИ ТА ЧИСТА МАРЖА ЗА 4 КАПСУЛАМИ ---", "", ""],
                ["За кадром: Наукове ядро (НУС НААН)", `Витрати: ${calcState.cost1} грн`, `Виручка: ${calcState.rev1} грн | Маржа: +${calcState.mar1} грн`],
                ["Капсула І: Базове насінництво (ДГ)", `Витрати: ${calcState.cost2} грн`, `Виручка: ${calcState.rev2} грн | Маржа: +${calcState.mar2} грн`],
                ["Капсула ІІ: Фермерський пул СН-1", `Витрати: ${calcState.cost3} грн`, `Виручка: ${calcState.rev3} грн | Маржа: +${calcState.mar3} грн`],
                ["Капсула ІІІ: Завод переробки Zero-Waste", `Витрати: ${calcState.cost4} грн`, `Виручка: ${calcState.rev4} грн | Маржа: +${calcState.mar4} грн`],
                ["", "", ""],
                ["--- ЗВЕДЕНІ ФІНАНСОВІ ІНДИКАТОРИ ---", "", ""],
                ["Сукупні витрати циклу", calcState.totalCost, "грн"],
                ["Сукупна виручка кластеру", calcState.totalRev, "грн"],
                ["Сукупна чиста маржа кластеру", calcState.totalMargin, "грн"],
                ["Рентабельність інвестицій (ROI)", calcState.roi, "%"],
                ["Економічний ефект цифровізації (E₂)", calcState.effectE2, "грн/рік (+15%)"],
                ["Вигода НУС НААН (кратність зростання)", calcState.naanMult, "раза (проти 46 000 грн без стартапу ІІБ)"],
                ["Гарантований аванс селекції НААН", calcState.prepaySum, "грн"],
                ["Точка входу інвестицій (стартове вузьке місце)", calcState.investmentEntryUah, `грн (~${calcState.investmentEntryEur} тис. €)`],
                ["Окупність лінії переробки (CAPEX 8 млн грн)", `${(8000000 / Math.max(1, calcState.mar4)).toFixed(1)} сезону`, `~${Math.round((8000000 / Math.max(1, calcState.mar4)) * 12)} міс. (Чиста маржа переробки: ${calcState.mar4} грн/рік)`]
            ];

            const csvContent = "\uFEFF" + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `AgroCluster_Financial_Model_${calcState.area}ha.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            logAction('CSV_FINANCIAL_MODEL_DOWNLOADED', `ЄДРПОУ: ${currentProfile.edrpou}, Площа: ${calcState.area} га, Маржа: ${fmtMln(calcState.totalMargin)}`);
        });
    }

    // 5. Відкриття вбудованого Веб-Модуля Скорингу Грантів та Вирізки Стартапу
    const grantModalWrapper = document.getElementById('grantModalWrapper');
    const grantModalBody = document.getElementById('grantModalBody');

    document.getElementById('openGrantModalBtn').addEventListener('click', () => {
        const op = resolveGrantOperatorClient(currentProfile);
        const lotKey = document.getElementById('startupLotSelect').value;
        const selectedLot = STARTUP_LOTS[lotKey] || STARTUP_LOTS.lot_100k_eur;

        logAction('WEB_GRANT_SCORING_OPENED', `ЄДРПОУ: ${currentProfile.edrpou}, Оператор: ${op.operator_edrpou}, Лот: ${selectedLot.code}`);

        grantModalBody.innerHTML = `
            <div style="background:#eff6ff; border:1px solid #93c5fd; border-radius:8px; padding:12px; margin-bottom:14px; font-size:12.5px;">
                <strong style="color:#1d4ed8; display:block; margin-bottom:4px;">✔ Верифікація Заявника за методологією ТОВ «ІІБ»:</strong>
                <div><strong>Обраний учасник кластеру:</strong> ${currentProfile.company_name} (ЄДРПОУ ${currentProfile.edrpou}, ${currentProfile.kved})</div>
                <div style="margin-top:4px;"><strong>Офіційний Заявник (Оператор подачі):</strong> <span style="color:#059669; font-weight:700;">${op.operator_name} (ЄДРПОУ ${op.operator_edrpou})</span></div>
                <div style="margin-top:4px; color:#475569; font-size:11.5px;">${op.note}</div>
            </div>

            <h3 style="font-size:14px; margin:0 0 8px 0; color:#0f172a;">Ранжовані Стартап-лоти, вирізані з Драфту (${calcState.area} га | Маржа ${fmtMln(calcState.totalMargin)}):</h3>
            <div style="display:grid; gap:10px; margin-bottom:14px;">
                ${Object.values(STARTUP_LOTS).map(lot => {
                    const isSelected = lot.code === selectedLot.code;
                    return `
                        <div style="border:${isSelected ? '2px solid #059669' : '1px solid #cbd5e1'}; background:${isSelected ? '#ecfdf5' : '#f8fafc'}; border-radius:8px; padding:10px 12px; font-size:12px;">
                            <div style="display:flex; justify-content:space-between; font-weight:700; color:#0f172a;">
                                <span>${isSelected ? '★ [ОБРАНИЙ ЛОТ] ' : ''}${lot.title}</span>
                                <span style="color:#059669;">${lot.amount}</span>
                            </div>
                            <div style="color:#475569; margin-top:4px;">${lot.sliceDesc}</div>
                            <div style="color:#1e293b; margin-top:4px; font-size:11px;"><strong>Договірна база:</strong> ${lot.contractChain}</div>
                        </div>
                    `;
                }).join('')}
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; padding:10px 14px; border-radius:8px;">
                <span style="font-size:12px; color:#334155;">Точка входу для старту Базової Еліти: <strong>${fmtMln(calcState.investmentEntryUah)} (~${calcState.investmentEntryEur} тис. €)</strong></span>
                <button id="confirmWebGrantBtn" class="btn" style="background:#059669;">Зафіксувати паспорт лоту в Реєстрі ІІБ</button>
            </div>
        `;

        grantModalWrapper.style.display = 'flex';

        document.getElementById('confirmWebGrantBtn').addEventListener('click', () => {
            logAction('STARTUP_LOT_REGISTERED', `Зафіксовано лот ${selectedLot.code} від імені оператора ${op.operator_edrpou}`);
            grantModalWrapper.style.display = 'none';
            addChatMsg(
                'Координатор Драфту ІІБ',
                `✅ <strong>Паспорт Стартап-лоту зафіксовано у Веб-Реєстрі ІІБ:</strong><br>` +
                `• <strong>Лот:</strong> ${selectedLot.title}<br>` +
                `• <strong>Оператор подачі:</strong> ${op.operator_name} (ЄДРПОУ ${op.operator_edrpou})<br>` +
                `• <strong>Сума:</strong> ${selectedLot.amount}. Готово до вивантаження Тизера (PDF) та Кластерної Угоди (DOCX).`
            );
        });
    });

    document.getElementById('closeGrantModalBtn').addEventListener('click', () => {
        grantModalWrapper.style.display = 'none';
    });

    logAction('SESSION_START', 'Ініціалізовано клієнтське ядро AgroCluster Analytics v3.0 (Методологія Драфту ІІБ)');
});
