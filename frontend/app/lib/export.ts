import { Conversation } from '../types/conversations'

/**
 * Export conversation as Markdown
 */
export function exportAsMarkdown(conversation: Conversation): void {
    let md = `# ${conversation.title}\n\n`
    md += `*Created: ${new Date(conversation.createdAt).toLocaleString()}*\n`
    md += `*Updated: ${new Date(conversation.updatedAt).toLocaleString()}*\n`
    if (conversation.repoPath) {
        md += `*Repository: ${conversation.repoPath}*\n`
    }
    md += `\n---\n\n`

    conversation.messages.forEach((msg, idx) => {
        const icon = msg.role === 'user' ? '👤' : '🤖'
        const role = msg.role === 'user' ? 'User' : 'Assistant'
        md += `## ${icon} ${role}\n\n`
        md += `${msg.content}\n\n`
        if (idx < conversation.messages.length - 1) {
            md += `---\n\n`
        }
    })

    downloadFile(
        md,
        `${sanitizeFilename(conversation.title)}.md`,
        'text/markdown'
    )
}

/**
 * Export conversation as JSON
 */
export function exportAsJSON(conversation: Conversation): void {
    const json = JSON.stringify(conversation, null, 2)
    downloadFile(
        json,
        `${sanitizeFilename(conversation.title)}.json`,
        'application/json'
    )
}

/**
 * Export conversation as PDF
 */
export async function exportAsPDF(conversation: Conversation): Promise<void> {
    // Dynamically import jsPDF to avoid SSR issues
    const { default: jsPDF } = await import('jspdf')

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = 210
    const pageHeight = 297
    const margin = 20
    const lineHeight = 7
    let y = margin

    // Title
    pdf.setFontSize(20)
    pdf.setFont('helvetica', 'bold')
    pdf.text(conversation.title, margin, y)
    y += lineHeight * 2

    // Metadata
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(100, 100, 100)
    pdf.text(`Created: ${new Date(conversation.createdAt).toLocaleString()}`, margin, y)
    y += lineHeight
    pdf.text(`Updated: ${new Date(conversation.updatedAt).toLocaleString()}`, margin, y)
    y += lineHeight * 2

    // Messages
    pdf.setTextColor(0, 0, 0)

    for (const msg of conversation.messages) {
        // Check if we need a new page
        if (y > pageHeight - margin - 20) {
            pdf.addPage()
            y = margin
        }

        // Role header
        pdf.setFontSize(12)
        pdf.setFont('helvetica', 'bold')
        const roleText = msg.role === 'user' ? '👤 User' : '🤖 Assistant'
        pdf.text(roleText, margin, y)
        y += lineHeight

        // Message content
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'normal')
        const lines = pdf.splitTextToSize(msg.content, pageWidth - 2 * margin)

        for (const line of lines) {
            if (y > pageHeight - margin - 10) {
                pdf.addPage()
                y = margin
            }
            pdf.text(line, margin, y)
            y += lineHeight
        }

        y += lineHeight
    }

    pdf.save(`${sanitizeFilename(conversation.title)}.pdf`)
}

/**
 * Helper: Download a file
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/**
 * Helper: Sanitize filename
 */
function sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9_\-]/gi, '_').slice(0, 100)
}
