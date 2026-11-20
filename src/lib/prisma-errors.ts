export const PrismaErrorCode = {
  NOT_FOUND: "P2025",
  UNIQUE_VIOLATION: "P2002",
  FOREIGN_KEY_VIOLATION: "P2003",
} as const;

export type PrismaErrorCodeValueType = (typeof PrismaErrorCode)[keyof typeof PrismaErrorCode];

export function isPrismaError(error: unknown, code: PrismaErrorCodeValueType) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === code
  );
}





// export const PrismaErrorCode = {
//   NOT_FOUND: "P2025",
//   UNIQUE_VIOLATION: "P2002",
//   FOREIGN_KEY_VIOLATION: "P2003",
// } as const;

// export type PrismaErrorCodeValueType = (typeof PrismaErrorCode)[keyof typeof PrismaErrorCode];

// export function isPrismaError(error: unknown, code: PrismaErrorCodeValueType): boolean {
//   return (
//     typeof error === "object" && // prisma xetalari obyekt formasinda olur
//     error !== null && 
//     "code" in error && // gələn obyekdə code adli hisse varmi yoxla
//     (error as { code: unknown }).code === code
//   );
// }

// burda sadəcə prisma xətalarını yoxlayırıq,
//  əgər gələn error prisma xətasıdırsa və
//  onun code hissəsi bizim verdiyimiz code ilə eynidirsə
//  true qaytarır, əks halda false qaytarır.






// export const PrismaErrorCode = {
//   NOT_FOUND: "P2025",
//   UNIQUE_VIOLATION: "P2002",
//   FOREIGN_KEY_VIOLATION: "P2003",
// } as const;

// export type PrismaErrorCodeValueType = (typeof PrismaErrorCode)[keyof typeof PrismaErrorCode];

// export function isPrismaError(error: unknown, code: PrismaErrorCodeValueType): boolean {
//   return (
//     typeof error === "object" &&
//     error !== null &&
//     "code" in error &&
//     (error as { code: unknown }).code === code
//   );
// }