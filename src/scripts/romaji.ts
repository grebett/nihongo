const ROMAJI_TO_HIRAGANA: Record<string, string> = {
  // vowels
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  // k
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  // s
  sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ',
  // t
  ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と',
  // n
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  // h
  ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ',
  // m
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  // y
  ya: 'や', yu: 'ゆ', yo: 'よ',
  // r
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  // w
  wa: 'わ', wo: 'を',
  // n
  nn: 'ん', n: 'ん',
  // g
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  // z
  za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  // d
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  // b
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  // p
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  // combo
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
  cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
  bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
};

export function romajiToHiragana(input: string): string {
  let result = '';
  let i = 0;
  const s = input.toLowerCase();

  while (i < s.length) {
    // double consonant -> っ
    if (i + 1 < s.length && s[i] === s[i + 1] && s[i] !== 'a' && s[i] !== 'i' && s[i] !== 'u' && s[i] !== 'e' && s[i] !== 'o' && s[i] !== 'n') {
      result += 'っ';
      i++;
      continue;
    }

    // try 3-char match first, then 2, then 1
    let matched = false;
    for (const len of [3, 2, 1]) {
      const chunk = s.slice(i, i + len);
      if (ROMAJI_TO_HIRAGANA[chunk]) {
        // special case: 'n' before a vowel or 'y' should not become ん
        if (chunk === 'n' && i + 1 < s.length && 'aiueoy'.includes(s[i + 1])) {
          continue;
        }
        result += ROMAJI_TO_HIRAGANA[chunk];
        i += len;
        matched = true;
        break;
      }
    }

    if (!matched) {
      result += s[i];
      i++;
    }
  }

  return result;
}
