type SessionDeleteClient = {
  session: {
    deleteMany(args: {
      where: {
        userId: string;
        token?: { not: string };
      };
    }): Promise<unknown>;
  };
};

/** Revoke every authenticated session after an out-of-band credential reset. */
export async function revokeAllUserSessions(client: SessionDeleteClient, userId: string) {
  await client.session.deleteMany({ where: { userId } });
}

/** Keep the session that proved the current password, but revoke every other device. */
export async function revokeOtherUserSessions(
  client: SessionDeleteClient,
  userId: string,
  currentToken: string,
) {
  await client.session.deleteMany({
    where: { userId, token: { not: currentToken } },
  });
}