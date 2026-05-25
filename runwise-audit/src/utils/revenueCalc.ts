import type { RevenueAssumptions } from '../types';

export interface RevenueOutput {
  estimatedPaidLeads: number;
  estimatedFormEmailLeads: number;
  currentAppointments: number;
  projectedAppointments: number;
  additionalAppointments: number;
  additionalClosedJobs: number;
  monthlyRevenueExposure: number;
  annualRevenueExposure: number;
}

export function computeRevenue(a: RevenueAssumptions): RevenueOutput {
  const estimatedPaidLeads = Math.round(a.estimatedMonthlyGoogleAdsSpend / a.averageCPL);
  const estimatedFormEmailLeads = Math.round(estimatedPaidLeads * (a.formEmailLeadPercentage / 100));
  const currentAppointments = Math.round(estimatedFormEmailLeads * (a.currentFormToAppointmentRate / 100));
  const projectedAppointments = Math.round(estimatedFormEmailLeads * (a.improvedFormToAppointmentRate / 100));
  const additionalAppointments = projectedAppointments - currentAppointments;
  const additionalClosedJobs = Math.round(additionalAppointments * (a.appointmentToCloseRate / 100));
  const monthlyRevenueExposure = Math.round(
    additionalClosedJobs * a.averageTicket * (a.conservativeRecoveryPercentage / 100)
  );
  const annualRevenueExposure = monthlyRevenueExposure * 12;

  return {
    estimatedPaidLeads,
    estimatedFormEmailLeads,
    currentAppointments,
    projectedAppointments,
    additionalAppointments,
    additionalClosedJobs,
    monthlyRevenueExposure,
    annualRevenueExposure,
  };
}
