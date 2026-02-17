import { PayrollComputationInput, PayrollComputationResult } from './types';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computePayrollItem(input: PayrollComputationInput): PayrollComputationResult {
  const worked = Math.max(0, input.workedMinutes);
  const breaks = Math.max(0, input.breakMinutes);
  const overtime = Math.max(0, input.overtimeMinutes);
  const late = Math.max(0, input.lateMinutes);

  let payableMinutes = worked;
  if (input.rule.breakDeductionMode === 'UNPAID_ALL_BREAKS') {
    payableMinutes = Math.max(0, worked - breaks);
  } else if (input.rule.breakDeductionMode === 'UNPAID_OVERTIME_ONLY') {
    payableMinutes = Math.max(0, worked - Math.max(0, breaks - overtime));
  }

  const regularMinutes = Math.max(0, payableMinutes - overtime);

  const hourly = input.rule.baseHourlyRate;
  const regularPay = (regularMinutes / 60) * hourly;
  const overtimePay = (overtime / 60) * hourly * input.rule.overtimeMultiplier;
  const grossPay = round2(regularPay + overtimePay);

  const latePenalty = round2(late * input.rule.latePenaltyPerMinute);
  const finalPay = round2(Math.max(0, grossPay - latePenalty));

  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    payableMinutes,
    regularMinutes,
    overtimeMinutes: overtime,
    grossPay,
    latePenalty,
    finalPay,
    metadata: {
      workedMinutes: worked,
      breakMinutes: breaks,
      lateMinutes: late,
      breakDeductionMode: input.rule.breakDeductionMode
    }
  };
}
