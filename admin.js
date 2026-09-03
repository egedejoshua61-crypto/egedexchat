async function approveVerification(paymentId) {
    const res = await fetch(`/api/admin/approve-verification/${paymentId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if(res.ok) alert("User Verified!");
}

async function banUser(userId, reason, duration) {
    // duration in days
    await fetch(`/api/admin/ban`, {
        method: 'POST',
        body: JSON.stringify({ userId, reason, duration }),
        headers: { 'Content-Type': 'application/json' }
    });
}