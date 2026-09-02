/**
 * Repository loading for the checker pre-pass (sequence B-1).
 *
 * Reads content/ and config/ straight from the filesystem — deliberately NOT
 * through astro:content, for two reasons: (1) the checker must aggregate every
 * schema violation across every file in one report, while Astro's content sync
 * stops at the first broken entry; (2) lib code stays framework-free and
 * testable (layer rule).
 *
 * Schema validation here uses the exact same Zod modules as content.config.ts
 * — one definition, two consumers. A file that passes here cannot fail there.
 *
 * Finding codes: field-level messages already carry their code prefix
 * ("E-105: …") from the schema modules; files whose issues carry no specific
 * code fall back to E-100 (generic frontmatter violation).
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { z } from 'astro/zod';
import {
  albumSchema,
  artistSchema,
  genresConfigSchema,
  reviewSchema,
  siteConfigSchema,
  snapshotSchema,
  storySchema,
  tagRegistrySchema,
  SLUG_PATTERN,
  type Album,
  type Artist,
  type GenresConfig,
  type ReviewFrontmatter,
  type SiteConfig,
  type Snapshot,
  type Story,
  type TagRegistry,
} from '../schema/index.ts';
import type { CheckResult, Finding } from './types.ts';
import { emptyResult } from './types.ts';

export interface Entry<T> {
  /** File stem — doubles as the slug (file name = slug = URL segment). */
  slug: string;
  /** Repo-relative path, forward slashes (for report messages). */
  file: string;
  data: T;
  /** Markdown body (empty string for .yaml entries). */
  body: string;
}

export interface RepoData {
  albums: Entry<Album>[];
  reviews: Entry<ReviewFrontmatter>[];
  stories: Entry<Story>[];
  artists: Entry<Artist>[];
  snapshots: Entry<Snapshot>[];
  site: SiteConfig | null;
  genres: GenresConfig | null;
  tags: TagRegistry | null;
}

export interface LoadOutcome {
  data: RepoData;
  result: CheckResult;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Map a Zod error to findings — one per issue, extracting the "E-xxx:" code
 * a schema message may carry; otherwise the generic E-100. */
function zodFindings(error: z.ZodError, file: string): Finding[] {
  return error.issues.map((issue) => {
    const coded = /^(E-\d{3})/.exec(issue.message);
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    // Zod's unrecognized-key issue keeps its default English text (strict()
    // offers no per-key message hook) — translate it here so every finding
    // reaches the editor in Korean.
    const message =
      issue.code === 'unrecognized_keys'
        ? `E-100: 알 수 없는 필드 ${issue.keys.map((k) => `"${k}"`).join(', ')} — 오타이거나 계약에 없는 필드입니다. 필드명을 확인하고 제거하거나 고치세요.`
        : coded
          ? issue.message
          : `E-100: ${path}${issue.message}`;
    return { code: coded ? coded[1] : 'E-100', message, file };
  });
}

function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .sort(); // code-point order — deterministic on every OS/locale
}

function loadCollection<T>(
  root: string,
  relDir: string,
  ext: string,
  schema: z.ZodType<T>,
  result: CheckResult,
): Entry<T>[] {
  const entries: Entry<T>[] = [];
  for (const name of listFiles(join(root, relDir), ext)) {
    const slug = name.slice(0, -ext.length);
    const file = `${relDir}/${name}`;
    const raw = readFileSync(join(root, relDir, name), 'utf8');

    let frontmatter: unknown;
    let body = '';
    if (ext === '.yaml') {
      frontmatter = safeParseYaml(raw, file, result);
      if (frontmatter === undefined) continue;
    } else {
      const match = FRONTMATTER_RE.exec(raw);
      if (!match) {
        result.failures.push({
          code: 'E-100',
          message: 'E-100: 프론트매터(--- 블록)가 없습니다. 파일 상단에 필수 필드를 담은 --- 블록을 추가하세요.',
          file,
        });
        continue;
      }
      frontmatter = safeParseYaml(match[1], file, result);
      if (frontmatter === undefined) continue;
      body = match[2];
    }

    // File name is a URL segment — enforce slug shape here (E-107); field-level
    // slugs are covered by the schemas.
    if (!SLUG_PATTERN.test(slug)) {
      result.failures.push({
        code: 'E-107',
        message: `E-107: 파일명 "${slug}"이(가) slug 형식이 아닙니다. 소문자 영문·숫자·하이픈만 사용하세요 (파일명 = slug = URL).`,
        file,
      });
    }

    const parsed = schema.safeParse(frontmatter);
    if (!parsed.success) {
      result.failures.push(...zodFindings(parsed.error, file));
      continue;
    }
    entries.push({ slug, file, data: parsed.data, body });
  }
  return entries;
}

function safeParseYaml(text: string, file: string, result: CheckResult): unknown {
  try {
    return parseYaml(text) ?? {};
  } catch (err) {
    result.failures.push({
      code: 'E-100',
      message: `E-100: YAML을 읽을 수 없습니다 (${err instanceof Error ? err.message.split('\n')[0] : '구문 오류'}). 들여쓰기·콜론·따옴표를 확인하세요.`,
      file,
    });
    return undefined;
  }
}

function loadConfig<T>(root: string, rel: string, schema: z.ZodType<T>, result: CheckResult): T | null {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    result.failures.push({
      code: 'E-100',
      message: `E-100: 필수 설정 파일이 없습니다. ${rel}을 만들어야 빌드할 수 있습니다.`,
      file: rel,
    });
    return null;
  }
  const raw = safeParseYaml(readFileSync(abs, 'utf8'), rel, result);
  if (raw === undefined) return null;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    result.failures.push(...zodFindings(parsed.error, rel));
    return null;
  }
  return parsed.data;
}

/** Load and shape-validate the whole repository (content + config). */
export function loadRepo(root: string): LoadOutcome {
  const result = emptyResult();
  const data: RepoData = {
    albums: loadCollection(root, 'content/albums', '.yaml', albumSchema, result),
    reviews: loadCollection(root, 'content/reviews', '.md', reviewSchema, result),
    stories: loadCollection(root, 'content/stories', '.md', storySchema, result),
    artists: loadCollection(root, 'content/artists', '.md', artistSchema, result),
    snapshots: loadCollection(root, 'content/snapshots', '.md', snapshotSchema, result),
    site: loadConfig(root, 'config/site.yaml', siteConfigSchema, result),
    genres: loadConfig(root, 'config/genres.yaml', genresConfigSchema, result),
    tags: loadConfig(root, 'config/tags.yaml', tagRegistrySchema, result),
  };
  return { data, result };
}
