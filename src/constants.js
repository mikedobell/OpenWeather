export const LOCATIONS = [
  { id: 'pamrocks', name: 'Pam Rocks', lat: 49.4883, lon: -123.2983, color: '#63B3ED', colorDark: '#90CDF4' },
  { id: 'squamish', name: 'Squamish', lat: 49.7016, lon: -123.1558, color: '#3182CE', colorDark: '#63B3ED' },
  { id: 'whistler', name: 'Whistler', lat: 50.1163, lon: -122.9574, color: '#2C5282', colorDark: '#4299E1' },
  { id: 'lillooet', name: 'Lillooet', lat: 50.6868, lon: -121.9422, color: '#1A365D', colorDark: '#2B6CB0' },
];

export const VARIABLES = [
  {
    id: 'pressure',
    label: 'Surface Pressure',
    unit: 'hPa',
    layer: 'HRDPS.CONTINENTAL_PN',
    description: 'Mean sea-level pressure — higher inland pressure drives katabatic outflow',
  },
  {
    id: 'temperature',
    label: 'Surface Temperature',
    unit: '°C',
    layer: 'HRDPS.CONTINENTAL_TT',
    description: 'Air temperature at 2 m — inland heating drives anabatic inflow',
  },
  {
    id: 'cloud',
    label: 'Cloud Cover',
    unit: '%',
    layer: 'HRDPS.CONTINENTAL_NT',
    description: 'Total cloud cover — clear skies strengthen thermal gradients',
  },
];

export const DAYTIME_HOURS_PT = [];
for (let h = 7; h <= 21; h++) {
  DAYTIME_HOURS_PT.push(h);
}

export const API_ENDPOINT = import.meta.env.BASE_URL + 'api/forecast.php';
