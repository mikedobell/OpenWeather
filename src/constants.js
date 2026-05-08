// Greyscale gradient coast → interior, with Squamish highlighted in the
// accent red because the Spit is the focal site for most users.
export const LOCATIONS = [
  { id: 'pamrocks', name: 'Pam Rocks', lat: 49.4883, lon: -123.2983, color: '#A8A8A8', colorDark: '#A8A8A8' },
  { id: 'squamish', name: 'Squamish', lat: 49.7016, lon: -123.1558, color: '#BD231F', colorDark: '#BD231F' },
  { id: 'whistler', name: 'Whistler', lat: 50.1163, lon: -122.9574, color: '#6E6E6E', colorDark: '#6E6E6E' },
  { id: 'pemberton', name: 'Pemberton', lat: 50.3192, lon: -122.8035, color: '#484848', colorDark: '#484848' },
  { id: 'lillooet', name: 'Lillooet', lat: 50.6868, lon: -121.9422, color: '#282828', colorDark: '#282828' },
];

export const VARIABLES = [
  {
    id: 'pressure',
    label: 'Surface Pressure',
    unit: 'hPa',
    layer: 'HRDPS.CONTINENTAL_PN',
  },
  {
    id: 'temperature',
    label: 'Surface Temperature',
    unit: '°C',
    layer: 'HRDPS.CONTINENTAL_TT',
  },
  {
    id: 'cloud',
    label: 'Cloud Cover',
    unit: '%',
    layer: 'HRDPS.CONTINENTAL_NT',
  },
];

export const DAYTIME_HOURS_PT = [];
for (let h = 7; h <= 21; h++) {
  DAYTIME_HOURS_PT.push(h);
}
