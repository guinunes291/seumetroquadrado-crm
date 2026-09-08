// Somente o harness: as preferências da tabela ficam locais, sem sessão ou chamadas ao CRM.
export const useAuth = () => ({ user: null, session: null, loading: false });
export const useUserRoles = () => ({
  roles: [],
  isAdmin: false,
  isGestor: false,
  isSuperintendente: false,
});
