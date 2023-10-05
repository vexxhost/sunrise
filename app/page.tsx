import MainWrapper from '@/components/MainWrapper'
import ProjectStats from '@/components/ProjectStats'

export default function Page() {
    return <MainWrapper>
        <h1 className="text-4xl font-semibold mb-6 pb-2 border-b-2">Overview</h1>
        <ProjectStats />
    </MainWrapper>
}
