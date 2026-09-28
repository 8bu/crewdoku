import type { AreaCatalog } from './types'

/**
 * Tag rules on the schedule: problem-list entries for strict tag avoids (H6)
 * and tag coverage (H7), and the matching infeasible explanations.
 *
 * The tag kinds are the only board violations that carry `kind` + `params`
 * instead of a finished sentence, so their lines read in the active locale
 * (`board.problems.*`). The infeasible panel renders every kind the same way,
 * so its keys sit in the `panels.*` namespace its switch already reads; the
 * solver's English `message`/`label` stays the fallback.
 */
export const tagRules = {
  en: {
    // Problem list (board/violations.ts)
    'board.problems.tagAvoid': '{person} is set to {shift} on {date}, but the {tag} rule forbids that shift',
    'board.problems.tagCoverageShort': '{tag}: {shift} on {date} needs at least {limit}, but only {count} scheduled',
    'board.problems.tagCoverageOver': '{tag}: {shift} on {date} allows at most {limit}, but {count} scheduled',

    // InfeasiblePanel — conflict core
    'panels.conflict.tagAvoid.starvation':
      '{shift} on {date} needs at least {min}, but only {available} can work it: strict avoids on {tag} rule out the rest.',
    'panels.conflict.tagCoverage.starvation':
      'Only {available} with {tag} can work {shift} on {date}, but its coverage needs at least {min}.',

    // InfeasiblePanel — relaxation buttons
    'panels.relax.softenTagAvoid': 'Make {tag} avoids soft instead of strict',
    'panels.relax.relaxTagCoverage': 'Lower the {tag} minimum for {shift} on {date} to {min}',
    'panels.relax.fallbackH6': 'Turn off strict tag avoids',
    'panels.relax.fallbackH7': 'Turn off tag coverage',
  },
  vi: {
    'board.problems.tagAvoid': '{person} được xếp ca {shift} ngày {date}, nhưng quy tắc của nhãn {tag} không cho phép ca đó',
    'board.problems.tagCoverageShort': '{tag}: ca {shift} ngày {date} cần ít nhất {limit}, nhưng chỉ {count} được xếp ca',
    'board.problems.tagCoverageOver': '{tag}: ca {shift} ngày {date} cho phép tối đa {limit}, nhưng {count} được xếp ca',

    'panels.conflict.tagAvoid.starvation':
      'Ca {shift} ngày {date} cần ít nhất {min}, nhưng chỉ {available} có thể làm: quy tắc tránh nghiêm ngặt của nhãn {tag} loại những người còn lại.',
    'panels.conflict.tagCoverage.starvation':
      'Chỉ {available} mang nhãn {tag} có thể làm ca {shift} ngày {date}, nhưng mức bao phủ của nhãn này cần ít nhất {min}.',

    'panels.relax.softenTagAvoid': 'Chuyển quy tắc tránh của nhãn {tag} thành mềm thay vì nghiêm ngặt',
    'panels.relax.relaxTagCoverage': 'Giảm mức tối thiểu của nhãn {tag} cho ca {shift} ngày {date} xuống {min}',
    'panels.relax.fallbackH6': 'Tắt quy tắc tránh nghiêm ngặt theo nhãn',
    'panels.relax.fallbackH7': 'Tắt mức bao phủ theo nhãn',
  },
  es: {
    'board.problems.tagAvoid': '{person} tiene asignado {shift} el {date}, pero la regla de la etiqueta {tag} lo prohíbe',
    'board.problems.tagCoverageShort': '{tag}: {shift} del {date} necesita al menos {limit}, pero solo {count} en turno',
    'board.problems.tagCoverageOver': '{tag}: {shift} del {date} permite como máximo {limit}, pero {count} en turno',

    'panels.conflict.tagAvoid.starvation':
      '{shift} del {date} necesita al menos {min}, pero solo {available} pueden trabajar: las exclusiones estrictas de {tag} descartan al resto.',
    'panels.conflict.tagCoverage.starvation':
      'Solo {available} con la etiqueta {tag} pueden trabajar {shift} del {date}, pero su cobertura necesita al menos {min}.',

    'panels.relax.softenTagAvoid': 'Convertir las exclusiones de {tag} en preferencias flexibles',
    'panels.relax.relaxTagCoverage': 'Bajar el mínimo de {tag} para {shift} del {date} a {min}',
    'panels.relax.fallbackH6': 'Desactivar las exclusiones estrictas por etiqueta',
    'panels.relax.fallbackH7': 'Desactivar la cobertura por etiqueta',
  },
  fr: {
    'board.problems.tagAvoid': '{person} est affecté à {shift} le {date}, mais la règle de l’étiquette {tag} l’interdit',
    'board.problems.tagCoverageShort': '{tag} : {shift} le {date} nécessite au moins {limit}, mais {count} au planning',
    'board.problems.tagCoverageOver': '{tag} : {shift} le {date} autorise au maximum {limit}, mais {count} au planning',

    'panels.conflict.tagAvoid.starvation':
      '{shift} le {date} nécessite au moins {min}, mais seules {available} peuvent l’assurer : les exclusions strictes de {tag} écartent les autres.',
    'panels.conflict.tagCoverage.starvation':
      'Seules {available} portant l’étiquette {tag} peuvent assurer {shift} le {date}, mais sa couverture nécessite au moins {min}.',

    'panels.relax.softenTagAvoid': 'Rendre les exclusions de {tag} souples plutôt que strictes',
    'panels.relax.relaxTagCoverage': 'Abaisser le minimum de {tag} pour {shift} le {date} à {min}',
    'panels.relax.fallbackH6': 'Désactiver les exclusions strictes par étiquette',
    'panels.relax.fallbackH7': 'Désactiver la couverture par étiquette',
  },
  ja: {
    'board.problems.tagAvoid': '{person}は{date}に{shift}が入っていますが、タグ「{tag}」のルールで禁止されています',
    'board.problems.tagCoverageShort': '{tag}: {date}の{shift}には最低{limit}必要ですが、配置は{count}だけです',
    'board.problems.tagCoverageOver': '{tag}: {date}の{shift}は最大{limit}までですが、配置は{count}です',

    'panels.conflict.tagAvoid.starvation':
      '{date}の{shift}には最低{min}必要ですが、勤務できるのは{available}だけです。タグ「{tag}」の厳格な除外が残りを外しています。',
    'panels.conflict.tagCoverage.starvation':
      '{date}の{shift}を担当できるタグ「{tag}」は{available}だけですが、カバーには最低{min}必要です。',

    'panels.relax.softenTagAvoid': 'タグ「{tag}」の除外を厳格ではなくソフトにする',
    'panels.relax.relaxTagCoverage': '{date}の{shift}のタグ「{tag}」の最低人数を{min}に下げる',
    'panels.relax.fallbackH6': 'タグの厳格な除外をオフにする',
    'panels.relax.fallbackH7': 'タグのカバー条件をオフにする',
  },
  de: {
    'board.problems.tagAvoid': '{person} ist am {date} für {shift} eingeteilt, aber die Regel des Tags {tag} verbietet diese Schicht',
    'board.problems.tagCoverageShort': '{tag}: {shift} am {date} braucht mindestens {limit}, aber nur {count} eingeplant',
    'board.problems.tagCoverageOver': '{tag}: {shift} am {date} erlaubt höchstens {limit}, aber {count} eingeplant',

    'panels.conflict.tagAvoid.starvation':
      '{shift} am {date} benötigt mindestens {min}, aber nur {available} können ihn übernehmen: strikte Ausschlüsse für {tag} schließen die übrigen aus.',
    'panels.conflict.tagCoverage.starvation':
      'Nur {available} mit dem Tag {tag} können {shift} am {date} übernehmen, die Besetzung braucht aber mindestens {min}.',

    'panels.relax.softenTagAvoid': 'Ausschlüsse von {tag} weich statt strikt machen',
    'panels.relax.relaxTagCoverage': 'Mindestbesetzung für {tag} bei {shift} am {date} auf {min} senken',
    'panels.relax.fallbackH6': 'Strikte Tag-Ausschlüsse ausschalten',
    'panels.relax.fallbackH7': 'Tag-Besetzung ausschalten',
  },
  pt: {
    'board.problems.tagAvoid': '{person} está escalado para {shift} em {date}, mas a regra da etiqueta {tag} proíbe esse turno',
    'board.problems.tagCoverageShort': '{tag}: {shift} em {date} precisa de pelo menos {limit}, mas apenas {count} na escala',
    'board.problems.tagCoverageOver': '{tag}: {shift} em {date} permite no máximo {limit}, mas {count} na escala',

    'panels.conflict.tagAvoid.starvation':
      '{shift} em {date} precisa de pelo menos {min}, mas apenas {available} podem trabalhar: as exclusões rígidas de {tag} descartam os restantes.',
    'panels.conflict.tagCoverage.starvation':
      'Apenas {available} com a etiqueta {tag} podem trabalhar {shift} em {date}, mas a cobertura precisa de pelo menos {min}.',

    'panels.relax.softenTagAvoid': 'Tornar as exclusões de {tag} flexíveis em vez de rígidas',
    'panels.relax.relaxTagCoverage': 'Reduzir o mínimo de {tag} para {shift} em {date} para {min}',
    'panels.relax.fallbackH6': 'Desativar as exclusões rígidas por etiqueta',
    'panels.relax.fallbackH7': 'Desativar a cobertura por etiqueta',
  },
} satisfies AreaCatalog
