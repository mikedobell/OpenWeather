export const LOCATIONS = [
  { id: 'pamrocks', name: 'Pam Rocks', lat: 49.4883, lon: -123.2983, color: '#B81F8F', colorDark: '#E84BB0' },
  { id: 'squamish', name: 'Squamish', lat: 49.7016, lon: -123.1558, color: '#C92E72', colorDark: '#E85490' },
  { id: 'whistler', name: 'Whistler', lat: 50.1163, lon: -122.9574, color: '#D24555', colorDark: '#E66270' },
  { id: 'pemberton', name: 'Pemberton', lat: 50.3192, lon: -122.8035, color: '#D6533A', colorDark: '#EA6E50' },
  { id: 'lillooet', name: 'Lillooet', lat: 50.6868, lon: -121.9422, color: '#B8431A', colorDark: '#DD6A38' },
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
