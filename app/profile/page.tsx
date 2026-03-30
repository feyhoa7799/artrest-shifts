// app/profile/page.tsx
"use client";
import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const roles = [
  "Член команды",
  "Член команды 1 уровня",
  "Тренер",
  "Младший менеджер смены",
  "Менеджер смены 1 уровня",
  "Менеджер смены 2 уровня",
  "Заместитель директора",
  "Директор"
];

export default function ProfilePage() {
  const supabase = createClientComponentClient();
  const [profile, setProfile] = useState<any>({});
  const [restaurants, setRestaurants] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: r } = await supabase.from("restaurants").select("*").eq("is_active", true);
      setRestaurants(r || []);
      const { data: p } = await supabase.from("employee_profiles").select("*").single();
      if (p) setProfile(p);
    };
    load();
  }, []);

  const saveProfile = async () => {
    const { error } = await supabase.from("employee_profiles").upsert(profile);
    if (error) alert(error.message);
    else alert("Сохранено");
  };

  return (
    <div>
      <input placeholder="ФИО" value={profile.full_name || ""} onChange={e => setProfile({...profile, full_name: e.target.value})} />
      <input placeholder="Телефон +7XXXXXXXXXX" value={profile.phone || ""} onChange={e => setProfile({...profile, phone: e.target.value})} />
      
      <select value={profile.role || ""} onChange={e => setProfile({...profile, role: e.target.value})}>
        <option value="">Выберите должность</option>
        {roles.map(r => <option key={r} value={r}>{r}</option>)}
      </select>

      <select value={profile.home_restaurant_id || ""} onChange={e => setProfile({...profile, home_restaurant_id: Number(e.target.value)})}>
        <option value="">Выберите ресторан</option>
        {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>

      <button onClick={saveProfile}>Сохранить профиль</button>
    </div>
  );
}