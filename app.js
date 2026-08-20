const PERSON_FIELDS = [
  { key: "currentAge", label: "当前年龄", value: 43, min: 18, max: 75, step: 1, unit: "岁" },
  { key: "retirementAge", label: "退休年龄", value: 60, min: 40, max: 75, step: 1, unit: "岁" },
  { key: "stopWorkAge", label: "停止工作年龄", value: 43, min: 18, max: 75, step: 1, unit: "岁" },
  {
    key: "accountBalance",
    label: "养老金账户余额",
    value: 50,
    min: 0,
    max: 100,
    step: 0.5,
    unit: "万元",
  },
  {
    key: "paidYears",
    label: "已实际缴费年限",
    value: 20,
    min: 0,
    max: 50,
    step: 0.25,
    unit: "年",
  },
  {
    key: "coefficient",
    label: "历史统一缴费系数",
    value: 2.9,
    min: 0.3,
    max: 3,
    step: 0.01,
    unit: "倍",
  },
  {
    key: "futureContribution",
    label: "退休前缴费档位",
    value: 60,
    unit: "%",
    choices: [0, 60, 70, 80, 90, 100, 150, 200, 250, 300],
  },
];

const RETIREMENT_DIVISORS = {
  40: 233, 41: 230, 42: 226, 43: 223, 44: 220, 45: 216, 46: 212, 47: 208,
  48: 204, 49: 199, 50: 195, 51: 190, 52: 185, 53: 180, 54: 175, 55: 170,
  56: 164, 57: 158, 58: 152, 59: 145, 60: 139, 61: 132, 62: 125, 63: 117,
  64: 109, 65: 101, 66: 93, 67: 84, 68: 75, 69: 65, 70: 56,
};

const state = {
  coefficients: { a: [], b: [] },
  projection: [],
  chartMode: "nominal",
  hoverIndex: null,
};

function numberValue(id) {
  const value = Number(document.getElementById(id)?.value);
  return Number.isFinite(value) ? value : 0;
}

function formatMoney(value, unit = "万元", decimals = 1) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (unit === "元") {
    return `${sign}¥${abs.toLocaleString("zh-CN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(2)} 亿元`;
  return `${sign}${abs.toLocaleString("zh-CN", {
    maximumFractionDigits: decimals,
  })} 万元`;
}

function createControl(field, person = null) {
  const id = person ? `${person}-${field.key}` : field.key;
  if (field.choices) {
    const options = field.choices
      .map(
        (value, index) =>
          `<option value="${value}"${value === field.value ? " selected" : ""}>${
            field.choiceLabels?.[index] ?? `${value}%`
          }</option>`,
      )
      .join("");
    return `
      <div class="control-card select-card">
        <div class="control-label">
          <label for="${id}">${field.label}</label>
          <span class="select-hint">当前至退休</span>
        </div>
        <select id="${id}" class="select-control">${options}</select>
      </div>`;
  }
  return `
    <div class="control-card">
      <div class="control-label">
        <label for="${id}">${field.label}</label>
        <div class="number-wrap">
          <input id="${id}" type="number" value="${field.value}" min="${field.min}"
            max="${field.max}" step="${field.step}" />
          <span>${field.unit}</span>
        </div>
      </div>
      <input data-sync="${id}" type="range" value="${field.value}" min="${field.min}"
        max="${field.max}" step="${field.step}" />
    </div>`;
}

function renderPersonControls() {
  const personBDefaults = {
    currentAge: 42,
    retirementAge: 50,
    stopWorkAge: 42,
    accountBalance: 30,
    paidYears: 20,
    coefficient: 2,
    futureContribution: 60,
  };
  for (const person of ["a", "b"]) {
    const fields = PERSON_FIELDS.map((field) => {
      const adjusted =
        person === "b" && field.key in personBDefaults
          ? { ...field, value: personBDefaults[field.key] }
          : field;
      return createControl(adjusted, person);
    });
    document.getElementById(`${person}-controls`).innerHTML = fields.join("");
  }
}

function renderPhaseExpenseControls() {
  document.getElementById("phase-expense-controls").innerHTML = Array.from(
    { length: 10 },
    (_, index) => {
      const start = index * 5 + 1;
      const end = start + 4;
      return `
        <div class="phase-expense-item">
          <div class="phase-expense-label">
            <label for="expense-phase-${index}">第 ${start}–${end} 年</label>
            <div class="number-wrap">
              <input id="expense-phase-${index}" type="number" value="25"
                min="0" max="500" step="0.5" />
              <span>万</span>
            </div>
          </div>
          <input data-sync="expense-phase-${index}" type="range" value="25"
            min="0" max="150" step="0.5" />
        </div>`;
    },
  ).join("");
}

function bindSyncedInputs() {
  document.querySelectorAll('input[type="range"][data-sync]').forEach((range) => {
    const number = document.getElementById(range.dataset.sync);
    range.addEventListener("input", () => {
      number.value = range.value;
      handleInput(number.id);
    });
    number.addEventListener("input", () => {
      const parsed = Number(number.value);
      if (Number.isFinite(parsed)) {
        range.value = Math.min(Number(range.max), Math.max(Number(range.min), parsed));
      }
      handleInput(number.id);
    });
    number.addEventListener("blur", () => {
      const parsed = Number(number.value);
      if (!Number.isFinite(parsed)) number.value = range.value;
      calculate();
    });
  });
  document.querySelectorAll(".select-control").forEach((select) => {
    select.addEventListener("change", () => handleInput(select.id));
  });
}

function phaseExpense(year) {
  const phaseIndex = Math.min(9, Math.max(0, Math.floor(Math.max(0, year - 1) / 5)));
  return numberValue(`expense-phase-${phaseIndex}`);
}

function handleInput(id) {
  const match = id.match(
    /^([ab])-(currentAge|retirementAge|stopWorkAge|paidYears|coefficient|futureContribution)$/,
  );
  if (match) {
    const [, person, key] = match;
    if (
      ["currentAge", "retirementAge", "stopWorkAge", "paidYears", "coefficient"].includes(key)
    ) {
      state.coefficients[person] = [];
    }
    if (key === "futureContribution") {
      setFutureCoefficients(person);
    }
    if (!document.getElementById(`${person}-details`).hidden) {
      renderYearGrid(person);
    }
  }
  calculate();
}

function getPerson(person) {
  const result = {};
  for (const field of PERSON_FIELDS) {
    result[field.key] = numberValue(`${person}-${field.key}`);
  }
  return result;
}

function coefficientCount(personData) {
  const futureYears = Math.max(0, Math.ceil(personData.retirementAge - personData.currentAge));
  return Math.max(0, Math.ceil(personData.paidYears) + futureYears);
}

function ensureCoefficients(person) {
  const personData = getPerson(person);
  const count = coefficientCount(personData);
  const paidCount = Math.max(0, Math.ceil(personData.paidYears));
  const employedYears = Math.max(
    0,
    Math.min(
      Math.ceil(personData.retirementAge - personData.currentAge),
      Math.ceil(personData.stopWorkAge - personData.currentAge),
    ),
  );
  const futureValue = personData.futureContribution / 100;
  const existing = state.coefficients[person];
  if (existing.length < count) {
    state.coefficients[person] = [
      ...existing,
      ...Array.from({ length: count - existing.length }, (_, offset) => {
        const index = existing.length + offset;
        return index < paidCount + employedYears ? personData.coefficient : futureValue;
      }),
    ];
  } else if (existing.length > count) {
    state.coefficients[person] = existing.slice(0, count);
  }
}

function setFutureCoefficients(person) {
  ensureCoefficients(person);
  const data = getPerson(person);
  const paidCount = Math.max(0, Math.ceil(data.paidYears));
  const employedYears = Math.max(
    0,
    Math.min(
      Math.ceil(data.retirementAge - data.currentAge),
      Math.ceil(data.stopWorkAge - data.currentAge),
    ),
  );
  const futureValue = data.futureContribution / 100;
  state.coefficients[person] = state.coefficients[person].map((value, index) =>
    index < paidCount + employedYears ? value : futureValue,
  );
}

function renderYearGrid(person) {
  ensureCoefficients(person);
  const data = getPerson(person);
  const paidCount = Math.max(0, Math.ceil(data.paidYears));
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - paidCount;
  document.getElementById(`${person}-year-grid`).innerHTML = state.coefficients[person]
    .map((value, index) => {
      const year = startYear + index;
      const stopWorkYear = currentYear + Math.max(0, data.stopWorkAge - data.currentAge);
      const marker =
        year < currentYear
          ? ""
          : year < stopWorkYear
            ? "（在职预计）"
            : "（灵活就业预计）";
      const minimum = year < currentYear ? 0.3 : 0;
      return `
        <div class="year-input">
          <label for="${person}-coefficient-${index}">${year}${marker}</label>
          <input id="${person}-coefficient-${index}" data-person="${person}"
            data-index="${index}" type="number" value="${value.toFixed(2)}"
            min="${minimum}" max="3" step="0.01" aria-label="${year}年缴费系数" />
        </div>`;
    })
    .join("");

  document
    .querySelectorAll(`#${person}-year-grid input`)
    .forEach((input) =>
      input.addEventListener("input", () => {
        const value = Number(input.value);
        if (Number.isFinite(value)) {
          state.coefficients[person][Number(input.dataset.index)] = value;
          calculate();
        }
      }),
    );
}

function averageCoefficient(person) {
  ensureCoefficients(person);
  const values = state.coefficients[person];
  if (!values.length) return getPerson(person).coefficient;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function futureCoefficientEntries(person, data) {
  ensureCoefficients(person);
  const paidCount = Math.max(0, Math.ceil(data.paidYears));
  const futureYears = Math.max(0, Math.ceil(data.retirementAge - data.currentAge));
  return state.coefficients[person].slice(paidCount, paidCount + futureYears);
}

function divisorForAge(age) {
  const rounded = Math.round(age);
  if (rounded <= 40) return RETIREMENT_DIVISORS[40];
  if (rounded >= 70) return RETIREMENT_DIVISORS[70];
  return RETIREMENT_DIVISORS[rounded];
}

function contributionBase(coefficient, year) {
  if (coefficient <= 0) return 0;
  const wageGrowth = numberValue("wage-growth") / 100;
  const fullContributionBase = numberValue("avg-wage") * (1 + wageGrowth) ** year;
  const calculatedBase = fullContributionBase * coefficient;
  return Math.abs(coefficient - 0.6) < 0.0001
    ? Math.floor(calculatedBase)
    : Math.round(calculatedBase * 100) / 100;
}

function flexibleEmploymentCost(pension, year) {
  if (year < pension.yearsUntilStopWork || year >= pension.yearsToRetirement) {
    return { total: 0, pension: 0, medical: 0 };
  }
  const coefficient = pension.futureCoefficients[year] ?? 0;
  if (coefficient <= 0) {
    return { total: 0, pension: 0, medical: 0 };
  }
  const base = contributionBase(coefficient, year);
  const fullContributionBase = contributionBase(1, year);
  const pensionCost = base * 0.2 * 12;
  const medicalCost = fullContributionBase * 0.049 * 12;
  return {
    total: (pensionCost + medicalCost) / 10000,
    pension: pensionCost / 10000,
    medical: medicalCost / 10000,
  };
}

function calculatePension(person) {
  const data = getPerson(person);
  const yearsToRetirement = Math.max(0, data.retirementAge - data.currentAge);
  const yearsUntilStopWork = Math.max(
    0,
    Math.min(yearsToRetirement, data.stopWorkAge - data.currentAge),
  );
  const wageGrowth = numberValue("wage-growth") / 100;
  const currentMonthlyWage = numberValue("avg-wage");
  const retirementMonthlyWage = currentMonthlyWage * (1 + wageGrowth) ** yearsToRetirement;
  ensureCoefficients(person);
  const allCoefficients = state.coefficients[person];
  const indexSum = allCoefficients.reduce((sum, coefficient) => sum + coefficient, 0);
  const indexYears = allCoefficients.length;
  const z = indexYears > 0 ? indexSum / indexYears : data.coefficient;
  const futureCoefficients = futureCoefficientEntries(person, data);
  const futurePaidYears = futureCoefficients.reduce(
    (years, coefficient) => years + (coefficient > 0 ? 1 : 0),
    0,
  );
  const actualYears = Math.max(0, data.paidYears + futurePaidYears);
  const totalYears = actualYears;

  const basic = ((retirementMonthlyWage + retirementMonthlyWage * z) / 2) * totalYears * 0.01;

  let account = Math.max(0, data.accountBalance) * 10000;
  const accountContributions = [];
  const hasFutureContributions = futureCoefficients.some((coefficient) => coefficient > 0);
  if (hasFutureContributions) {
    futureCoefficients.forEach((coefficient, year) => {
      const base = contributionBase(coefficient, year);
      const credited = base * 12 * 0.08;
      account += credited;
      accountContributions.push(credited);
    });
  } else {
    futureCoefficients.forEach(() => accountContributions.push(0));
  }

  const retirementDivisor = divisorForAge(data.retirementAge);
  const accountPension = account / retirementDivisor;
  return {
    ...data,
    yearsToRetirement,
    yearsUntilStopWork,
    retirementMonthlyWage,
    z,
    indexSum,
    indexYears,
    allCoefficients,
    actualYears,
    basic,
    accountPension,
    accountAtRetirement: account,
    accountContributions,
    retirementDivisor,
    futureCoefficients,
    total: basic + accountPension,
  };
}

function renderPension(person, pension) {
  const resultElement = document.getElementById(`${person}-pension-result`);
  const calculationWasOpen =
    resultElement.querySelector(".calculation-process")?.open ?? false;
  const currentYear = new Date().getFullYear();
  const paidCount = Math.max(0, Math.ceil(pension.paidYears));
  const firstYear = currentYear - paidCount;
  const indexEntries = pension.allCoefficients.map((coefficient, index) => {
    const year = firstYear + index;
    const futureIndex = index - paidCount;
    const stage =
      index < paidCount
        ? "历史"
        : futureIndex < pension.yearsUntilStopWork
          ? "在职"
          : "灵活就业";
    return `<span class="index-entry"><b>${year}</b>${coefficient.toFixed(2)} · ${stage}</span>`;
  });
  const historicalSum = pension.allCoefficients
    .slice(0, paidCount)
    .reduce((sum, value) => sum + value, 0);
  const employedSum = pension.futureCoefficients
    .slice(0, Math.ceil(pension.yearsUntilStopWork))
    .reduce((sum, value) => sum + value, 0);
  const flexibleSum = pension.futureCoefficients
    .slice(Math.ceil(pension.yearsUntilStopWork))
    .reduce((sum, value) => sum + value, 0);
  const creditedTotal = pension.accountContributions.reduce(
    (sum, value) => sum + value,
    0,
  );
  resultElement.innerHTML = `
    <div class="pension-total">
      <span>预计退休首年月养老金</span>
      <strong>${formatMoney(pension.total, "元", 2)} / 月</strong>
      <small>实际缴费指数 ${pension.z.toFixed(4)} · 退休时账户约 ${formatMoney(
        pension.accountAtRetirement / 10000,
      )} · 实缴 ${pension.actualYears.toFixed(2)} 年</small>
    </div>
    <div>
      <span>基础养老金</span>
      <strong>${formatMoney(pension.basic, "元", 0)}</strong>
    </div>
    <div>
      <span>个人账户养老金</span>
      <strong>${formatMoney(pension.accountPension, "元", 0)}</strong>
    </div>
    <details class="calculation-process"${calculationWasOpen ? " open" : ""}>
      <summary>养老金计算过程</summary>
      <div class="calculation-section index-calculation">
        <h4>1. 实际缴费工资指数 Z实指数</h4>
        <p class="calculation-formula">
          Z实指数 = 各年度缴费系数之和 ÷ 应缴年度数
        </p>
        <div class="formula-substitution">
          (${historicalSum.toFixed(2)} 历史 + ${employedSum.toFixed(2)} 在职预计 +
          ${flexibleSum.toFixed(2)} 灵活就业预计) ÷ ${pension.indexYears}
          = ${pension.indexSum.toFixed(2)} ÷ ${pension.indexYears}
          = <strong>${pension.z.toFixed(4)}</strong>
        </div>
        <p class="calculation-note">逐年系数（0% 缴费年度以 0 参与平均）：</p>
        <div class="index-entry-list">${indexEntries.join("")}</div>
      </div>
      <div class="calculation-section">
        <h4>2. 基础养老金</h4>
        <p class="calculation-formula">
          (C平 + C平 × Z实指数) ÷ 2 × N实 × 1%
        </p>
        <div class="formula-substitution">
          (${pension.retirementMonthlyWage.toFixed(2)} +
          ${pension.retirementMonthlyWage.toFixed(2)} × ${pension.z.toFixed(4)})
          ÷ 2 × ${pension.actualYears.toFixed(2)} × 1%
          = <strong>${formatMoney(pension.basic, "元", 2)} / 月</strong>
        </div>
      </div>
      <div class="calculation-section">
        <h4>3. 个人账户养老金</h4>
        <p class="calculation-formula">
          (当前账户余额 + 未来计入个人账户金额) ÷ 计发月数
        </p>
        <div class="formula-substitution">
          (${formatMoney(pension.accountBalance)} +
          ${formatMoney(creditedTotal / 10000)}) ÷ ${pension.retirementDivisor}
          = ${formatMoney(pension.accountAtRetirement / 10000)} ÷
          ${pension.retirementDivisor}
          = <strong>${formatMoney(pension.accountPension, "元", 2)} / 月</strong>
        </div>
      </div>
      <div class="calculation-total">
        月养老金 = 基础养老金 ${formatMoney(pension.basic, "元", 2)}
        + 个人账户养老金 ${formatMoney(pension.accountPension, "元", 2)}
        = <strong>${formatMoney(pension.total, "元", 2)}</strong>
      </div>
    </details>`;
}

function buildProjection(pensions) {
  const savings = numberValue("savings");
  const returnRate = numberValue("return-rate") / 100;
  const inflation = numberValue("inflation-rate") / 100;
  const currentYear = new Date().getFullYear();
  let assets = savings;
  const result = [];

  for (let year = 0; year <= 50; year += 1) {
    const inflationFactor = (1 + inflation) ** year;
    const livingExpense = phaseExpense(year) * inflationFactor;
    const employmentCosts = pensions.map((pension) => flexibleEmploymentCost(pension, year));
    const flexibleEmploymentExpense = employmentCosts.reduce(
      (sum, cost) => sum + cost.total,
      0,
    );
    const expense = livingExpense + flexibleEmploymentExpense;
    let pensionIncome = 0;
    for (const pension of pensions) {
      if (year >= pension.yearsToRetirement) {
        const yearsReceiving = year - pension.yearsToRetirement;
        pensionIncome +=
          (pension.total * 12 * (1 + inflation) ** yearsReceiving) / 10000;
      }
    }

    const investmentIncome = year > 0 ? assets * returnRate : 0;
    if (year > 0) assets += investmentIncome + pensionIncome - expense;
    result.push({
      year,
      calendarYear: currentYear + year,
      assets,
      expense,
      livingExpense,
      flexibleEmploymentExpense,
      pensionIncome,
      investmentIncome,
      realAssets: assets / inflationFactor,
      realExpense: expense / inflationFactor,
      realPension: pensionIncome / inflationFactor,
      realInvestmentIncome: investmentIncome / inflationFactor,
    });
  }
  return result;
}

function renderSummary(pensions) {
  const ending = state.projection.at(-1);
  const depleted = state.projection.find((point) => point.assets < 0);
  const inflation = numberValue("inflation-rate") / 100;
  const investment = numberValue("return-rate") / 100;
  const realReturn = ((1 + investment) / (1 + inflation) - 1) * 100;
  const combinedPension = pensions.reduce((sum, pension) => sum + pension.total, 0);

  document.getElementById("ending-assets").textContent = formatMoney(ending.assets);
  document.getElementById("ending-assets-real").textContent =
    `相当于今日 ${formatMoney(ending.realAssets)}`;
  document.getElementById("combined-pension").textContent =
    `${formatMoney(combinedPension, "元", 0)} / 月`;
  document.getElementById("real-return").textContent = `${realReturn.toFixed(2)}%`;

  const status = document.getElementById("sustainability");
  const detail = document.getElementById("depletion-year");
  if (depleted) {
    status.textContent = "存在缺口";
    status.style.color = "var(--coral)";
    detail.textContent = `预计 ${depleted.calendarYear} 年资产转负`;
  } else {
    status.textContent = "可持续";
    status.style.color = "";
    detail.textContent = "50 年内资产保持为正";
  }
}

function niceMaximum(value) {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function drawChart() {
  const canvas = document.getElementById("projection-chart");
  const wrapper = canvas.parentElement;
  const rect = wrapper.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;
  const pad = { top: 22, right: 22, bottom: 38, left: width < 600 ? 48 : 68 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const mode = state.chartMode;
  const assetKey = mode === "real" ? "realAssets" : "assets";
  const expenseKey = mode === "real" ? "realExpense" : "expense";
  const pensionKey = mode === "real" ? "realPension" : "pensionIncome";
  const interestKey = mode === "real" ? "realInvestmentIncome" : "investmentIncome";
  const allValues = state.projection.flatMap((point) => [
    Math.max(0, point[assetKey]),
    point[expenseKey],
    point[pensionKey],
    Math.max(0, point[interestKey]),
  ]);
  const maxY = niceMaximum(Math.max(...allValues) * 1.06);
  const minAsset = Math.min(0, ...state.projection.map((point) => point[assetKey]));
  const minY = minAsset < 0 ? -niceMaximum(Math.abs(minAsset) * 1.05) : 0;
  const range = maxY - minY;
  const x = (index) => pad.left + (index / 50) * chartW;
  const y = (value) => pad.top + ((maxY - value) / range) * chartH;

  ctx.clearRect(0, 0, width, height);
  ctx.font = '11px Inter, "PingFang SC", sans-serif';
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 5; i += 1) {
    const value = minY + (range * i) / 5;
    const py = y(value);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(23, 37, 31, 0.08)";
    ctx.setLineDash(value === 0 ? [] : [3, 5]);
    ctx.moveTo(pad.left, py);
    ctx.lineTo(width - pad.right, py);
    ctx.stroke();
    ctx.fillStyle = "#89918d";
    ctx.textAlign = "right";
    ctx.fillText(
      Math.abs(value) >= 10000
        ? `${(value / 10000).toFixed(1)}亿`
        : `${Math.round(value).toLocaleString("zh-CN")}万`,
      pad.left - 9,
      py,
    );
  }
  ctx.setLineDash([]);

  for (let i = 0; i <= 50; i += 10) {
    ctx.fillStyle = "#89918d";
    ctx.textAlign = "center";
    ctx.fillText(`${state.projection[i].calendarYear}`, x(i), height - 16);
  }

  const areaGradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  areaGradient.addColorStop(0, "rgba(30, 114, 85, 0.24)");
  areaGradient.addColorStop(1, "rgba(30, 114, 85, 0.015)");
  ctx.beginPath();
  state.projection.forEach((point, index) => {
    const px = x(index);
    const py = y(point[assetKey]);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.lineTo(x(50), y(0));
  ctx.lineTo(x(0), y(0));
  ctx.closePath();
  ctx.fillStyle = areaGradient;
  ctx.fill();

  function drawLine(key, color, lineWidth) {
    ctx.beginPath();
    state.projection.forEach((point, index) => {
      if (index === 0) ctx.moveTo(x(index), y(point[key]));
      else ctx.lineTo(x(index), y(point[key]));
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  drawLine(assetKey, "#1e7255", 3);
  drawLine(expenseKey, "#ea8068", 1.8);
  drawLine(pensionKey, "#6e93c8", 1.8);
  drawLine(interestKey, "#a5bd43", 1.8);

  if (state.hoverIndex !== null) {
    const point = state.projection[state.hoverIndex];
    const px = x(state.hoverIndex);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(23, 37, 31, 0.22)";
    ctx.setLineDash([3, 4]);
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, height - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [key, color] of [
      [assetKey, "#1e7255"],
      [expenseKey, "#ea8068"],
      [pensionKey, "#6e93c8"],
      [interestKey, "#a5bd43"],
    ]) {
      ctx.beginPath();
      ctx.arc(px, y(point[key]), 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  canvas._chartGeometry = {
    x,
    pad,
    width,
    assetKey,
    expenseKey,
    pensionKey,
    interestKey,
  };
}

function calculate() {
  const pensions = [calculatePension("a"), calculatePension("b")];
  renderPension("a", pensions[0]);
  renderPension("b", pensions[1]);
  state.projection = buildProjection(pensions);
  renderSummary(pensions);
  drawChart();
}

function bindChartInteraction() {
  const canvas = document.getElementById("projection-chart");
  const tooltip = document.getElementById("chart-tooltip");

  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const geometry = canvas._chartGeometry;
    if (!geometry) return;
    const relativeX = event.clientX - rect.left;
    const index = Math.max(
      0,
      Math.min(50, Math.round(((relativeX - geometry.pad.left) / (rect.width - geometry.pad.left - geometry.pad.right)) * 50)),
    );
    state.hoverIndex = index;
    const point = state.projection[index];
    tooltip.innerHTML = `
      <strong>${point.calendarYear} 年 · 第 ${index} 年</strong>
      资产：${formatMoney(point[geometry.assetKey])}<br>
      花费：${formatMoney(point[geometry.expenseKey])}
      （含灵活就业 ${formatMoney(
        state.chartMode === "real"
          ? point.flexibleEmploymentExpense / (1 + numberValue("inflation-rate") / 100) ** index
          : point.flexibleEmploymentExpense,
      )}）<br>
      养老金：${formatMoney(point[geometry.pensionKey])}<br>
      投资利息：${formatMoney(point[geometry.interestKey])}`;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.max(85, Math.min(rect.width - 85, geometry.x(index)))}px`;
    tooltip.style.top = `${Math.max(115, event.clientY - rect.top)}px`;
    drawChart();
  });

  canvas.addEventListener("mouseleave", () => {
    state.hoverIndex = null;
    tooltip.hidden = true;
    drawChart();
  });
}

function bindInterface() {
  document.querySelectorAll(".panel-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const content = document.getElementById(button.dataset.target);
      const collapsed = !content.hidden;
      content.hidden = collapsed;
      button.firstChild.textContent = collapsed ? "展开参数 " : "收起参数 ";
      button.closest(".panel").classList.toggle("is-collapsed", collapsed);
    });
  });

  document.querySelectorAll(".detail-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const details = document.getElementById(button.dataset.target);
      const person = button.dataset.target[0];
      const parameterContent = document.getElementById(`${person}-parameter-content`);
      if (parameterContent.hidden) {
        parameterContent.hidden = false;
        const parameterButton = document.querySelector(
          `.panel-toggle[data-target="${person}-parameter-content"]`,
        );
        parameterButton.firstChild.textContent = "收起参数 ";
        parameterButton.closest(".panel").classList.remove("is-collapsed");
      }
      details.hidden = !details.hidden;
      button.firstChild.textContent = details.hidden ? "展开逐年系数 " : "收起逐年系数 ";
      button.classList.toggle("active", !details.hidden);
      if (!details.hidden) renderYearGrid(person);
    });
  });

  document.querySelectorAll(".reset-coefficients").forEach((button) => {
    button.addEventListener("click", () => {
      state.coefficients[button.dataset.person] = [];
      renderYearGrid(button.dataset.person);
      calculate();
    });
  });

  document.getElementById("copy-first-expense").addEventListener("click", () => {
    const firstValue = numberValue("expense-phase-0");
    for (let index = 1; index < 10; index += 1) {
      const number = document.getElementById(`expense-phase-${index}`);
      const range = document.querySelector(
        `input[type="range"][data-sync="expense-phase-${index}"]`,
      );
      number.value = firstValue;
      range.value = firstValue;
    }
    calculate();
  });

  document.querySelectorAll(".chart-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.chartMode = button.dataset.mode;
      document.querySelectorAll(".chart-tab").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      drawChart();
    });
  });

  const formulaToggle = document.getElementById("formula-toggle");
  formulaToggle.addEventListener("click", () => {
    const content = document.getElementById("formula-content");
    content.hidden = !content.hidden;
    formulaToggle.textContent = content.hidden ? "查看公式" : "收起公式";
  });

  let resizeFrame;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(drawChart);
  });
}

renderPersonControls();
renderPhaseExpenseControls();
bindSyncedInputs();
for (const person of ["a", "b"]) renderYearGrid(person);
bindInterface();
bindChartInteraction();
calculate();
