/**
 * Countries and their dial codes, for the one control that needs them.
 *
 * Reference data rather than a decision: nothing here is a business rule, and
 * nothing here is stored. The phone field composes `+673 8959798` out of a
 * choice made from this list and a number typed beside it, and what reaches
 * the database is that string — see `lib/domain/phone.ts`, which compares
 * numbers without ever consulting this file.
 *
 * **The list is complete on purpose.** A short list of the countries guests
 * actually come from would be shorter to read and would, on the day somebody
 * arrives from a country nobody listed, refuse a real booking at the last
 * field. The cost of the full list is a few kilobytes and a search box; the
 * cost of a short one is the booking.
 *
 * Names are the short English forms a guest would recognise and a staff member
 * would say out loud — "South Korea", not "Korea, Republic of" — because this
 * list is read at a booking form, not filed with a ministry.
 */

export interface Country {
  /** ISO 3166-1 alpha-2, and the value the control tracks. */
  readonly code: string
  /** The short English name, as shown in the list. */
  readonly name: string
  /** The dial code without its `+`. */
  readonly dialCode: string
  /**
   * The country a bare dial code resolves to where several share one.
   *
   * `+1` is the United States and Canada both; `+44` is the United Kingdom and
   * three crown dependencies; `+7` is Russia and Kazakhstan. A number stored
   * as `+1 555 0100` cannot say which, so the control has to show one of them,
   * and picking alphabetically would show Canada and Guernsey. This says which
   * one to show, and it changes nothing about the number itself.
   */
  readonly preferred?: true
}

/**
 * Brunei, which is where the property is and where nearly every guest rings
 * from. The control opens on it so the common case needs no choice at all.
 *
 * Declared as its own binding rather than looked up out of the list, so the
 * default is a country by construction — a lookup would hand back a `Country |
 * undefined` and make every caller invent a fallback for a case that cannot
 * happen.
 */
export const DEFAULT_COUNTRY: Country = { code: 'BN', name: 'Brunei', dialCode: '673' }

/** Alphabetical by name, which is the order the list is read in. */
export const COUNTRIES: readonly Country[] = [
  { code: 'AF', name: 'Afghanistan', dialCode: '93' },
  { code: 'AL', name: 'Albania', dialCode: '355' },
  { code: 'DZ', name: 'Algeria', dialCode: '213' },
  { code: 'AD', name: 'Andorra', dialCode: '376' },
  { code: 'AO', name: 'Angola', dialCode: '244' },
  { code: 'AI', name: 'Anguilla', dialCode: '1264' },
  { code: 'AG', name: 'Antigua and Barbuda', dialCode: '1268' },
  { code: 'AR', name: 'Argentina', dialCode: '54' },
  { code: 'AM', name: 'Armenia', dialCode: '374' },
  { code: 'AW', name: 'Aruba', dialCode: '297' },
  { code: 'AU', name: 'Australia', dialCode: '61' },
  { code: 'AT', name: 'Austria', dialCode: '43' },
  { code: 'AZ', name: 'Azerbaijan', dialCode: '994' },
  { code: 'BS', name: 'Bahamas', dialCode: '1242' },
  { code: 'BH', name: 'Bahrain', dialCode: '973' },
  { code: 'BD', name: 'Bangladesh', dialCode: '880' },
  { code: 'BB', name: 'Barbados', dialCode: '1246' },
  { code: 'BY', name: 'Belarus', dialCode: '375' },
  { code: 'BE', name: 'Belgium', dialCode: '32' },
  { code: 'BZ', name: 'Belize', dialCode: '501' },
  { code: 'BJ', name: 'Benin', dialCode: '229' },
  { code: 'BM', name: 'Bermuda', dialCode: '1441' },
  { code: 'BT', name: 'Bhutan', dialCode: '975' },
  { code: 'BO', name: 'Bolivia', dialCode: '591' },
  { code: 'BA', name: 'Bosnia and Herzegovina', dialCode: '387' },
  { code: 'BW', name: 'Botswana', dialCode: '267' },
  { code: 'BR', name: 'Brazil', dialCode: '55' },
  DEFAULT_COUNTRY,
  { code: 'BG', name: 'Bulgaria', dialCode: '359' },
  { code: 'BF', name: 'Burkina Faso', dialCode: '226' },
  { code: 'BI', name: 'Burundi', dialCode: '257' },
  { code: 'KH', name: 'Cambodia', dialCode: '855' },
  { code: 'CM', name: 'Cameroon', dialCode: '237' },
  { code: 'CA', name: 'Canada', dialCode: '1' },
  { code: 'CV', name: 'Cape Verde', dialCode: '238' },
  { code: 'KY', name: 'Cayman Islands', dialCode: '1345' },
  { code: 'CF', name: 'Central African Republic', dialCode: '236' },
  { code: 'TD', name: 'Chad', dialCode: '235' },
  { code: 'CL', name: 'Chile', dialCode: '56' },
  { code: 'CN', name: 'China', dialCode: '86' },
  { code: 'CO', name: 'Colombia', dialCode: '57' },
  { code: 'KM', name: 'Comoros', dialCode: '269' },
  { code: 'CG', name: 'Congo (Republic)', dialCode: '242' },
  { code: 'CD', name: 'Congo (DRC)', dialCode: '243' },
  { code: 'CR', name: 'Costa Rica', dialCode: '506' },
  { code: 'CI', name: 'Côte d’Ivoire', dialCode: '225' },
  { code: 'HR', name: 'Croatia', dialCode: '385' },
  { code: 'CU', name: 'Cuba', dialCode: '53' },
  { code: 'CY', name: 'Cyprus', dialCode: '357' },
  { code: 'CZ', name: 'Czechia', dialCode: '420' },
  { code: 'DK', name: 'Denmark', dialCode: '45' },
  { code: 'DJ', name: 'Djibouti', dialCode: '253' },
  { code: 'DM', name: 'Dominica', dialCode: '1767' },
  { code: 'DO', name: 'Dominican Republic', dialCode: '1809' },
  { code: 'EC', name: 'Ecuador', dialCode: '593' },
  { code: 'EG', name: 'Egypt', dialCode: '20' },
  { code: 'SV', name: 'El Salvador', dialCode: '503' },
  { code: 'GQ', name: 'Equatorial Guinea', dialCode: '240' },
  { code: 'ER', name: 'Eritrea', dialCode: '291' },
  { code: 'EE', name: 'Estonia', dialCode: '372' },
  { code: 'SZ', name: 'Eswatini', dialCode: '268' },
  { code: 'ET', name: 'Ethiopia', dialCode: '251' },
  { code: 'FJ', name: 'Fiji', dialCode: '679' },
  { code: 'FI', name: 'Finland', dialCode: '358' },
  { code: 'FR', name: 'France', dialCode: '33' },
  { code: 'PF', name: 'French Polynesia', dialCode: '689' },
  { code: 'GA', name: 'Gabon', dialCode: '241' },
  { code: 'GM', name: 'Gambia', dialCode: '220' },
  { code: 'GE', name: 'Georgia', dialCode: '995' },
  { code: 'DE', name: 'Germany', dialCode: '49' },
  { code: 'GH', name: 'Ghana', dialCode: '233' },
  { code: 'GI', name: 'Gibraltar', dialCode: '350' },
  { code: 'GR', name: 'Greece', dialCode: '30' },
  { code: 'GL', name: 'Greenland', dialCode: '299' },
  { code: 'GD', name: 'Grenada', dialCode: '1473' },
  { code: 'GU', name: 'Guam', dialCode: '1671' },
  { code: 'GT', name: 'Guatemala', dialCode: '502' },
  { code: 'GG', name: 'Guernsey', dialCode: '44' },
  { code: 'GN', name: 'Guinea', dialCode: '224' },
  { code: 'GW', name: 'Guinea-Bissau', dialCode: '245' },
  { code: 'GY', name: 'Guyana', dialCode: '592' },
  { code: 'HT', name: 'Haiti', dialCode: '509' },
  { code: 'HN', name: 'Honduras', dialCode: '504' },
  { code: 'HK', name: 'Hong Kong', dialCode: '852' },
  { code: 'HU', name: 'Hungary', dialCode: '36' },
  { code: 'IS', name: 'Iceland', dialCode: '354' },
  { code: 'IN', name: 'India', dialCode: '91' },
  { code: 'ID', name: 'Indonesia', dialCode: '62' },
  { code: 'IR', name: 'Iran', dialCode: '98' },
  { code: 'IQ', name: 'Iraq', dialCode: '964' },
  { code: 'IE', name: 'Ireland', dialCode: '353' },
  { code: 'IM', name: 'Isle of Man', dialCode: '44' },
  { code: 'IL', name: 'Israel', dialCode: '972' },
  { code: 'IT', name: 'Italy', dialCode: '39' },
  { code: 'JM', name: 'Jamaica', dialCode: '1876' },
  { code: 'JP', name: 'Japan', dialCode: '81' },
  { code: 'JE', name: 'Jersey', dialCode: '44' },
  { code: 'JO', name: 'Jordan', dialCode: '962' },
  { code: 'KZ', name: 'Kazakhstan', dialCode: '7' },
  { code: 'KE', name: 'Kenya', dialCode: '254' },
  { code: 'KI', name: 'Kiribati', dialCode: '686' },
  { code: 'XK', name: 'Kosovo', dialCode: '383' },
  { code: 'KW', name: 'Kuwait', dialCode: '965' },
  { code: 'KG', name: 'Kyrgyzstan', dialCode: '996' },
  { code: 'LA', name: 'Laos', dialCode: '856' },
  { code: 'LV', name: 'Latvia', dialCode: '371' },
  { code: 'LB', name: 'Lebanon', dialCode: '961' },
  { code: 'LS', name: 'Lesotho', dialCode: '266' },
  { code: 'LR', name: 'Liberia', dialCode: '231' },
  { code: 'LY', name: 'Libya', dialCode: '218' },
  { code: 'LI', name: 'Liechtenstein', dialCode: '423' },
  { code: 'LT', name: 'Lithuania', dialCode: '370' },
  { code: 'LU', name: 'Luxembourg', dialCode: '352' },
  { code: 'MO', name: 'Macau', dialCode: '853' },
  { code: 'MG', name: 'Madagascar', dialCode: '261' },
  { code: 'MW', name: 'Malawi', dialCode: '265' },
  { code: 'MY', name: 'Malaysia', dialCode: '60' },
  { code: 'MV', name: 'Maldives', dialCode: '960' },
  { code: 'ML', name: 'Mali', dialCode: '223' },
  { code: 'MT', name: 'Malta', dialCode: '356' },
  { code: 'MH', name: 'Marshall Islands', dialCode: '692' },
  { code: 'MR', name: 'Mauritania', dialCode: '222' },
  { code: 'MU', name: 'Mauritius', dialCode: '230' },
  { code: 'MX', name: 'Mexico', dialCode: '52' },
  { code: 'FM', name: 'Micronesia', dialCode: '691' },
  { code: 'MD', name: 'Moldova', dialCode: '373' },
  { code: 'MC', name: 'Monaco', dialCode: '377' },
  { code: 'MN', name: 'Mongolia', dialCode: '976' },
  { code: 'ME', name: 'Montenegro', dialCode: '382' },
  { code: 'MA', name: 'Morocco', dialCode: '212' },
  { code: 'MZ', name: 'Mozambique', dialCode: '258' },
  { code: 'MM', name: 'Myanmar', dialCode: '95' },
  { code: 'NA', name: 'Namibia', dialCode: '264' },
  { code: 'NR', name: 'Nauru', dialCode: '674' },
  { code: 'NP', name: 'Nepal', dialCode: '977' },
  { code: 'NL', name: 'Netherlands', dialCode: '31' },
  { code: 'NC', name: 'New Caledonia', dialCode: '687' },
  { code: 'NZ', name: 'New Zealand', dialCode: '64' },
  { code: 'NI', name: 'Nicaragua', dialCode: '505' },
  { code: 'NE', name: 'Niger', dialCode: '227' },
  { code: 'NG', name: 'Nigeria', dialCode: '234' },
  { code: 'KP', name: 'North Korea', dialCode: '850' },
  { code: 'MK', name: 'North Macedonia', dialCode: '389' },
  { code: 'NO', name: 'Norway', dialCode: '47' },
  { code: 'OM', name: 'Oman', dialCode: '968' },
  { code: 'PK', name: 'Pakistan', dialCode: '92' },
  { code: 'PW', name: 'Palau', dialCode: '680' },
  { code: 'PS', name: 'Palestine', dialCode: '970' },
  { code: 'PA', name: 'Panama', dialCode: '507' },
  { code: 'PG', name: 'Papua New Guinea', dialCode: '675' },
  { code: 'PY', name: 'Paraguay', dialCode: '595' },
  { code: 'PE', name: 'Peru', dialCode: '51' },
  { code: 'PH', name: 'Philippines', dialCode: '63' },
  { code: 'PL', name: 'Poland', dialCode: '48' },
  { code: 'PT', name: 'Portugal', dialCode: '351' },
  { code: 'PR', name: 'Puerto Rico', dialCode: '1787' },
  { code: 'QA', name: 'Qatar', dialCode: '974' },
  { code: 'RE', name: 'Réunion', dialCode: '262' },
  { code: 'RO', name: 'Romania', dialCode: '40' },
  { code: 'RU', name: 'Russia', dialCode: '7', preferred: true },
  { code: 'RW', name: 'Rwanda', dialCode: '250' },
  { code: 'WS', name: 'Samoa', dialCode: '685' },
  { code: 'SM', name: 'San Marino', dialCode: '378' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '966' },
  { code: 'SN', name: 'Senegal', dialCode: '221' },
  { code: 'RS', name: 'Serbia', dialCode: '381' },
  { code: 'SC', name: 'Seychelles', dialCode: '248' },
  { code: 'SL', name: 'Sierra Leone', dialCode: '232' },
  { code: 'SG', name: 'Singapore', dialCode: '65' },
  { code: 'SK', name: 'Slovakia', dialCode: '421' },
  { code: 'SI', name: 'Slovenia', dialCode: '386' },
  { code: 'SB', name: 'Solomon Islands', dialCode: '677' },
  { code: 'SO', name: 'Somalia', dialCode: '252' },
  { code: 'ZA', name: 'South Africa', dialCode: '27' },
  { code: 'KR', name: 'South Korea', dialCode: '82' },
  { code: 'SS', name: 'South Sudan', dialCode: '211' },
  { code: 'ES', name: 'Spain', dialCode: '34' },
  { code: 'LK', name: 'Sri Lanka', dialCode: '94' },
  { code: 'SD', name: 'Sudan', dialCode: '249' },
  { code: 'SR', name: 'Suriname', dialCode: '597' },
  { code: 'SE', name: 'Sweden', dialCode: '46' },
  { code: 'CH', name: 'Switzerland', dialCode: '41' },
  { code: 'SY', name: 'Syria', dialCode: '963' },
  { code: 'TW', name: 'Taiwan', dialCode: '886' },
  { code: 'TJ', name: 'Tajikistan', dialCode: '992' },
  { code: 'TZ', name: 'Tanzania', dialCode: '255' },
  { code: 'TH', name: 'Thailand', dialCode: '66' },
  { code: 'TL', name: 'Timor-Leste', dialCode: '670' },
  { code: 'TG', name: 'Togo', dialCode: '228' },
  { code: 'TO', name: 'Tonga', dialCode: '676' },
  { code: 'TT', name: 'Trinidad and Tobago', dialCode: '1868' },
  { code: 'TN', name: 'Tunisia', dialCode: '216' },
  { code: 'TR', name: 'Turkey', dialCode: '90' },
  { code: 'TM', name: 'Turkmenistan', dialCode: '993' },
  { code: 'TV', name: 'Tuvalu', dialCode: '688' },
  { code: 'UG', name: 'Uganda', dialCode: '256' },
  { code: 'UA', name: 'Ukraine', dialCode: '380' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '971' },
  { code: 'GB', name: 'United Kingdom', dialCode: '44', preferred: true },
  { code: 'US', name: 'United States', dialCode: '1', preferred: true },
  { code: 'UY', name: 'Uruguay', dialCode: '598' },
  { code: 'UZ', name: 'Uzbekistan', dialCode: '998' },
  { code: 'VU', name: 'Vanuatu', dialCode: '678' },
  { code: 'VA', name: 'Vatican City', dialCode: '379' },
  { code: 'VE', name: 'Venezuela', dialCode: '58' },
  { code: 'VN', name: 'Vietnam', dialCode: '84' },
  { code: 'YE', name: 'Yemen', dialCode: '967' },
  { code: 'ZM', name: 'Zambia', dialCode: '260' },
  { code: 'ZW', name: 'Zimbabwe', dialCode: '263' },
]

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]))

/** The country with this ISO code, or `undefined` for one not in the list. */
export function countryByCode(code: string): Country | undefined {
  return BY_CODE.get(code)
}

/**
 * The country to *show* for a dial code.
 *
 * Several countries share one code, so this is a display choice and never an
 * assertion about where a number is: `+1 555 0100` shows the United States
 * because something has to be shown, not because the number is American.
 */
export function countryForDialCode(dialCode: string): Country | undefined {
  const matches = COUNTRIES.filter((country) => country.dialCode === dialCode)

  return matches.find((country) => country.preferred) ?? matches[0]
}

/**
 * The countries matching what somebody has typed into the search box.
 *
 * Matches the name and the dial code both, with or without the `+`, because
 * somebody who knows their code types `673` and somebody who does not types
 * `Bru`. Accents are folded so `Reunion` finds `Réunion` — a search box that
 * needs the right diacritic to answer is a search box that does not work on
 * the keyboard most people have.
 */
export function searchCountries(query: string): readonly Country[] {
  const needle = fold(query).replace(/^\+/, '')

  if (needle.length === 0) return COUNTRIES

  return COUNTRIES.filter(
    (country) => fold(country.name).includes(needle) || country.dialCode.startsWith(needle),
  )
}

function fold(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '')
}
