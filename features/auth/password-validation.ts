/**
 * Password validation rules and strength scoring for customer registration.
 */

export interface PasswordRule {
  id: "length" | "uppercase" | "lowercase" | "number" | "special";
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (p) => p.length >= 8,
  },
  {
    id: "uppercase",
    label: "At least one uppercase letter (A-Z)",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "lowercase",
    label: "At least one lowercase letter (a-z)",
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: "number",
    label: "At least one number (0-9)",
    test: (p) => /[0-9]/.test(p),
  },
  {
    id: "special",
    label: "At least one special character (!@#$%^&*...)",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

export interface PasswordEvaluation {
  metRules: Set<string>;
  allMet: boolean;
  score: number; // 0 to 5
  strength: "weak" | "medium" | "strong";
  strengthLabel: string;
}

export function evaluatePassword(password: string): PasswordEvaluation {
  const met = new Set<string>();

  for (const rule of PASSWORD_RULES) {
    if (rule.test(password)) {
      met.add(rule.id);
    }
  }

  const score = met.size;
  const allMet = score === PASSWORD_RULES.length;

  let strength: "weak" | "medium" | "strong" = "weak";
  let strengthLabel = "Weak";

  if (score >= 5) {
    strength = "strong";
    strengthLabel = "Strong";
  } else if (score >= 3) {
    strength = "medium";
    strengthLabel = "Medium";
  }

  return {
    metRules: met,
    allMet,
    score,
    strength,
    strengthLabel,
  };
}
