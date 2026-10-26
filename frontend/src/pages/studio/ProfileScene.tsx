import { ProfileCoach } from "../assistants/ProfileCoach";

/*
 * L'intervieweuse travaille sur le profil, pas sur un CV : dans le Studio, elle garde sa propre scène (une
 * conversation, avec le profil qui s'enrichit à côté). Un sujet venu du plan passe par `?sujet=`.
 */
export function ProfileScene() {
  return <ProfileCoach />;
}
