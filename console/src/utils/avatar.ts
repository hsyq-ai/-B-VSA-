const normalize = (value: unknown) => String(value ?? "").trim();

type Gender = "male" | "female";

type AvatarGenderInput = Gender | "m" | "f" | "男" | "女" | "未知" | "unknown" | undefined | null;

const MALE_BG = ["b6e3f4", "c0aede", "d1d4f9", "bfdbfe", "bae6fd"] as const;
const FEMALE_BG = ["ffd5dc", "ffdfbf", "f8c6d0", "f5b5c5", "fcd5ce"] as const;

const hashCode = (text: string): number => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const normalizeGender = (value: AvatarGenderInput): Gender | undefined => {
  const raw = normalize(value).toLowerCase();
  if (!raw) return undefined;
  if (["male", "m", "man", "男"].includes(raw)) return "male";
  if (["female", "f", "woman", "女"].includes(raw)) return "female";
  return undefined;
};

const resolveGender = (value: AvatarGenderInput, seed: string): Gender => {
  const normalized = normalizeGender(value);
  if (normalized) return normalized;
  return hashCode(seed) % 2 === 0 ? "male" : "female";
};

const pickBackground = (seed: string, gender: Gender): string => {
  const palette = gender === "female" ? FEMALE_BG : MALE_BG;
  return palette[hashCode(seed) % palette.length];
};

export const buildBusinessAvatar = (args: { seed: string; name?: string; gender?: AvatarGenderInput }) => {
  const seed = normalize(args.seed) || "user";
  const name = normalize(args.name);
  const gender = resolveGender(args.gender, seed);
  const backgroundColor = pickBackground(seed, gender);
  const avatarSeed = `${seed}-${gender}`;
  const src = `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=${backgroundColor}&radius=50`;

  return {
    gender,
    src,
    background: `#${backgroundColor}`,
    fallback: name.charAt(0) || seed.charAt(0) || "员",
  };
};

export const getPersonAvatarSeed = (value: unknown, fallback: string) => {
  return normalize(value) || normalize(fallback) || "user";
};
